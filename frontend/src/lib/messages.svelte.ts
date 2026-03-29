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
  loadedBlocks = $derived.by(() => {
    const blocks = this.visibleBlocks.toSorted((a, b) => a - b);
    if (blocks.length === 0) {
      return blocks;
    }

    if (blocks[0] > 0) {
      blocks.unshift(blocks[0] - this.parent.BLOCK_SIZE);
    }

    const lastVisibleBlock = blocks[blocks.length - 1];
    if (lastVisibleBlock < this.lastBlockId()) {
      blocks.push(lastVisibleBlock + this.parent.BLOCK_SIZE);
    }

    return blocks.toSorted((a, b) => a - b);
  });

  inFlightBlocks = new Set<number>();
  observer: IntersectionObserver;

  constructor(
    readonly parent: TextMessageCache,
    readonly room: Extract<Room, { type: "text" }>,
  ) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const blockId = Number(entry.target.getAttribute("data-block"));
          if (Number.isNaN(blockId)) {
            continue;
          }

          if (entry.isIntersecting) {
            if (!this.visibleBlocks.includes(blockId)) {
              this.visibleBlocks.push(blockId);
            }
          } else {
            const index = this.visibleBlocks.indexOf(blockId);
            if (index !== -1) {
              this.visibleBlocks.splice(index, 1);
            }
          }
        }
      },
      {
        root: null,
        rootMargin: "0px",
        threshold: 0.1,
      },
    );
  }

  initialize(nextMessageId: number) {
    if (this.visibleBlocks.length > 0) {
      return;
    }

    const lastMessageId = Math.max(0, nextMessageId - 1);
    this.visibleBlocks = [this.parent.getBlockId(lastMessageId)];
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

  lastMessageId() {
    return this.room.nextMessageId - 1;
  }

  lastBlockId() {
    return this.parent.getBlockId(this.lastMessageId());
  }

  destroy() {
    this.observer.disconnect();
  }
}

export class TextMessageCache {
  BLOCK_SIZE = 10;
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
