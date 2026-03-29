import { tick } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { Room, TextMessage } from "trurpchat-backend";
import type { Server } from "./servers.svelte";

type TextMessageBlock = {
  messages: TextMessage[];
  /** Whether the block is in sync with the server
   * This is set to false when the block loads from cache
   * on startup, and only becomes true when it is re-fetched
   * from the server
   */
  alive: boolean;
};

export class TextRoomCache {
  blocks: SvelteMap<number, TextMessageBlock> = new SvelteMap();
  visibleBlocks: number[] = $state([]);

  scrollPosition = $state<number | undefined>(undefined);

  lastMessageId() {
    return this.room.nextMessageId - 1;
  }

  lastBlockId() {
    return this.parent.getBlockId(this.lastMessageId());
  }

  inFlightBlocks = new Set<number>();
  observer: IntersectionObserver;

  constructor(
    readonly parent: TextMessageCache,
    readonly room: Extract<Room, { type: "text" }>,
  ) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            return;
          }

          const blockId = Number(entry.target.getAttribute("data-block"));
          if (Number.isNaN(blockId)) {
            continue;
          }

          if (blockId !== 0) {
            const prev = blockId - this.parent.BLOCK_SIZE;
            if (!this.visibleBlocks.includes(prev)) {
              this.visibleBlocks.push(prev);
            }
          }

          if (blockId !== this.lastBlockId()) {
            const next = blockId + this.parent.BLOCK_SIZE;
            if (!this.visibleBlocks.includes(next)) {
              this.visibleBlocks.push(next);
            }
          }

          if (!this.blocks.has(blockId)) {
            this.fetch(blockId);
          }
        }
      },
      {
        root: null,
        rootMargin: "0px",
        threshold: 0,
      },
    );
  }

  initialize() {
    if (this.visibleBlocks.length > 0) {
      return;
    }

    this.visibleBlocks = [this.lastBlockId()];
    // this.visibleBlocks = [Math.max(0, this.lastBlockId() - this.parent.BLOCK_SIZE * 7)];
  }

  attachBlock = (element: Element) => {
    this.observer.observe(element);
    return () => {
      this.observer.unobserve(element);
    };
  };

  fetch(blockId: number) {
    if (this.inFlightBlocks.has(blockId)) {
      return;
    }

    this.inFlightBlocks.add(blockId);
    tick().then(() => {
      this.parent.onfetchrequest(this.room.id, blockId);
    });
  }

  get(blockId: number, fetch = true) {
    this.parent.checkBlockId(blockId);

    const block = this.blocks.get(blockId);
    if (!block && fetch) {
      this.fetch(blockId);
    }
    return block;
  }

  /** Sets the block to be alive by default */
  set(blockId: number, messages: TextMessage[], alive: boolean = true) {
    this.parent.checkBlockId(blockId);
    this.inFlightBlocks.delete(blockId);
    this.blocks.set(blockId, { messages, alive });
  }

  append(message: TextMessage) {
    const blockId = this.parent.getBlockId(message.id);
    let block = this.get(blockId, false);

    const prevBlockId = Math.max(0, blockId - this.parent.BLOCK_SIZE);
    const prevBlock = this.get(prevBlockId, false);
    const isFirstBlock = blockId === 0;
    const prevBlockFull = prevBlock?.messages.length === this.parent.BLOCK_SIZE;

    if (!block && (isFirstBlock || prevBlockFull)) {
      block = { messages: [], alive: true };
    }

    if (!block?.alive) {
      this.fetch(blockId);
      return;
    }

    block.messages.push(message);
    this.set(blockId, block.messages);
  }

  edit(message: TextMessage) {
    const blockId = this.parent.getBlockId(message.id);
    const block = this.blocks.get(blockId);
    if (!block) return;
    const index = block.messages.findIndex((m) => m.id === message.id);
    if (index === -1) return;
    block.messages[index] = message;
  }

  delete(messageId: number) {
    const blockId = this.parent.getBlockId(messageId);
    const block = this.blocks.get(blockId);
    if (!block) return;
    const index = block.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;
    block.messages[index].deletedAt = new Date();
    block.messages[index].text = "";
    block.messages[index].replyTo = null;
    block.messages[index].attachments = null;
  }

  destroy() {
    this.observer.disconnect();
  }
}

export class TextMessageCache {
  BLOCK_SIZE = 3;
  /** Map of channel ID to room cache */
  cache: SvelteMap<number, TextRoomCache> = new SvelteMap();

  constructor(readonly server: Server) { }

  checkBlockId(blockId: number) {
    if (blockId < 0) {
      throw new Error("Block ID cannot be negative");
    }

    if (blockId % this.BLOCK_SIZE !== 0) {
      throw new Error("Block ID must be a aligned multiple of BLOCK_SIZE");
    }
  }

  getBlockId(messageId: number) {
    const id = messageId - (messageId % this.BLOCK_SIZE);
    this.checkBlockId(id);
    return id;
  }

  onfetchrequest: (channelId: number, blockId: number) => void = () => { };

  getRoom(roomId: number, create = true) {
    let room = this.cache.get(roomId);
    if (!room && create) {
      tick().then(() => {
        room = new TextRoomCache(this, this.server.findRoom(roomId) as any);
        this.cache.set(roomId, room);
      })
    }
    return room;
  }

  /** Sets the block to be alive by default */
  set(
    channelId: number,
    blockId: number,
    messages: TextMessage[],
    alive: boolean = true,
  ) {
    this.getRoom(channelId)?.set(blockId, messages, alive);
  }

  append(message: TextMessage) {
    this.getRoom(message.roomId)?.append(message);
  }

  edit(message: TextMessage) {
    this.getRoom(message.roomId, false)?.edit(message);
  }

  delete(roomId: number, messageId: number) {
    this.getRoom(roomId, false)?.delete(messageId);
  }
}
