import { tick } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { Room, TextMessage } from "trurpchat-backend";
import type { Server } from "./servers.svelte";
import { wait } from "./utils.svelte";

type TextMessageBlock = {
  messages: TextMessage[];
  /** Whether the block is in sync with the server
   * This is set to false when the block loads from cache
   * on startup, and only becomes true when it is re-fetched
   * from the server
   */
  alive: boolean;
};

const PRUNE_DELAY = 5 * 60 * 1000;
// const PRUNE_DELAY = 2000;
const DBG_WAIT = 0;

export class TextRoomCache {
  blocks: SvelteMap<number, TextMessageBlock> = new SvelteMap();
  renderBlocks: number[] = $state([]);
  visibleBlocks: number[] = $state([]);

  scrollPosition = $state<number | undefined>(undefined);

  lastMessageId() {
    return this.room.nextMessageId - 1;
  }

  lastBlockId() {
    return this.parent.getBlockId(this.lastMessageId());
  }

  inFlightBlocks = new Set<number>();
  pruneTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly parent: TextMessageCache,
    readonly room: Extract<Room, { type: "text" }>,
  ) {}

  pruneMemory() {
    const last = this.lastBlockId();
    const recent = Math.max(0, last - this.parent.BLOCK_SIZE * 5);

    const isRendered = this.renderBlocks.length > 0;
    const renderMin = isRendered ? this.renderBlocks[0] : 0;
    const renderMax = isRendered
      ? this.renderBlocks[this.renderBlocks.length - 1]
      : last;

    for (const block of this.blocks.keys()) {
      if (block > recent) continue;
      if (block > renderMin && block < renderMax) continue;
      this.blocks.delete(block);
    }
  }

  schedulePruneMemory() {
    if (this.pruneTimer !== undefined) {
      clearTimeout(this.pruneTimer);
    }
    this.pruneTimer = setTimeout(() => {
      this.pruneMemory();
    }, PRUNE_DELAY);
  }

  get(blockId: number, fetch = true) {
    this.parent.checkBlockId(blockId);

    const block = this.blocks.get(blockId);
    if (!block && fetch) {
      this.fetch(blockId);
    }
    this.schedulePruneMemory();
    return block;
  }

  /** Sets the block to be alive by default */
  set(blockId: number, messages: TextMessage[], alive: boolean = true) {
    this.parent.checkBlockId(blockId);
    this.inFlightBlocks.delete(blockId);
    const block = $state({ messages, alive });
    this.blocks.set(blockId, block);
    this.schedulePruneMemory();
  }

  append(message: TextMessage) {
    const blockId = this.parent.getBlockId(message.id);
    const block = this.get(blockId, false);

    if (block?.alive) {
      block.messages.push(message);
      return;
    }

    // happy path: the previous block is loaded and full
    // so the new one can be appended without fetching
    // because it's safe to assume that the new message
    // is the first one in the new block
    const isFirstBlock = blockId === 0;
    const prevBlockId = Math.max(0, blockId - this.parent.BLOCK_SIZE);
    const prevBlock = this.get(prevBlockId, false);
    const prevBlockFull = prevBlock?.messages.length === this.parent.BLOCK_SIZE;
    if (!block && (isFirstBlock || prevBlockFull)) {
      this.set(blockId, [message]);
      if (this.renderBlocks.includes(prevBlockId)) {
        this.renderBlocks.push(blockId);
      }
      return;
    }

    this.fetch(blockId);
    return;
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

  fetch(blockId: number) {
    if (this.inFlightBlocks.has(blockId)) {
      return;
    }

    const blok = this.blocks.get(blockId);
    if (blok?.alive) {
      return;
    }

    this.inFlightBlocks.add(blockId);
    tick().then(async () => {
      DBG_WAIT && (await wait(DBG_WAIT));
      this.parent.onfetchrequest(this.room.id, blockId);
    });
  }
}

export class TextMessageCache {
  BLOCK_SIZE = 10;
  /** Map of channel ID to room cache */
  cache: SvelteMap<number, TextRoomCache> = new SvelteMap();

  constructor(readonly server: Server) {}

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

  onfetchrequest: (channelId: number, blockId: number) => void = () => {};

  getRoom(roomId: number, create = true) {
    let room = this.cache.get(roomId);
    if (!room && create) {
      tick().then(() => {
        const room = this.server.findRoom(roomId);
        if (!room) return;
        if (room.type !== "text") return;
        const cache = new TextRoomCache(this, room);
        if (room.nextMessageId === 0) {
          cache.set(0, []);
        }
        this.cache.set(roomId, cache);
      });
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
    const room = this.getRoom(message.roomId, false);
    if (!room) return;
    room.append(message);
  }

  edit(message: TextMessage) {
    this.getRoom(message.roomId, false)?.edit(message);
  }

  delete(roomId: number, messageId: number) {
    this.getRoom(roomId, false)?.delete(messageId);
  }
}
