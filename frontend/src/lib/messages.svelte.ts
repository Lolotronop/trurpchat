import { tick } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { TextMessage, Unread } from "trurpchat-shared";
import type { RoomStore } from "./rooms.svelte";
import { wait } from "./utils.svelte";

export const BLOCK_SIZE = 10;
export function getBlockId(messageId: number) {
  const id = messageId - (messageId % BLOCK_SIZE);
  return id;
}

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

type TextMessageFetchCallback = (roomId: number, blockId: number) => void;

export class UnreadThing {
  unread: Unread[] = $state([]);

  constructor(
    readonly userId: number,
    readonly onSet: (roomId: number, messageId: number) => void,
  ) {}

  set(roomId: number, messageId: number, mentiones?: number) {
    const found = this.unread.find((u) => u.roomId === roomId);
    if (found) {
      found.unreadId = messageId;
      if (mentiones !== undefined) {
        found.mentiones = mentiones;
      }
    } else {
      this.unread.push({
        roomId,
        userId: this.userId,
        unreadId: messageId,
        mentiones: 0,
      });
    }

    this.onSet(roomId, messageId);
  }

  incMentiones(roomId: number) {
    const found = this.unread.find((u) => u.roomId === roomId);
    if (found) {
      found.mentiones++;
    }
  }

  get(roomId: number) {
    return this.unread.find((u) => u.roomId === roomId)?.unreadId ?? 0;
  }

  getMentions(roomId: number) {
    return this.unread.find((u) => u.roomId === roomId)?.mentiones ?? 0;
  }
}

export class TextRoomCache {
  blocks: SvelteMap<number, TextMessageBlock> = new SvelteMap();
  renderBlocks: number[] = $state([]);
  visibleBlocks: number[] = $state([]);

  scrollPosition = $state<number | undefined>(undefined);
  isAtBottom = $state(false);

  lastMessageId() {
    const room = this.rooms.find(this.roomId);
    if (!room) return 0;
    return room.nextMessageId - 1;
  }

  lastBlockId() {
    return getBlockId(this.lastMessageId());
  }

  inFlightBlocks = new Set<number>();
  pruneTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly rooms: RoomStore,
    readonly roomId: number,
    readonly fetchCallback: TextMessageFetchCallback,
  ) {}

  pruneMemory() {
    const last = this.lastBlockId();
    const recent = Math.max(0, last - BLOCK_SIZE * 5);

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
    const block = this.blocks.get(blockId);
    if (!block && fetch) {
      this.fetch(blockId);
    }
    this.schedulePruneMemory();
    return block;
  }

  getMessage(messageId: number, fetch = true) {
    const blockId = getBlockId(messageId);
    const block = this.blocks.get(blockId);
    const message = block?.messages.find((m) => m.id === messageId);
    if (!message && fetch) {
      this.fetch(blockId);
    }
    this.schedulePruneMemory();
    return message;
  }

  /** Sets the block to be alive by default */
  set(blockId: number, messages: TextMessage[], alive: boolean = true) {
    this.inFlightBlocks.delete(blockId);
    const block = $state({ messages, alive });
    this.blocks.set(blockId, block);
    this.schedulePruneMemory();
  }

  append(message: TextMessage) {
    const blockId = getBlockId(message.id);
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
    const prevBlockId = Math.max(0, blockId - BLOCK_SIZE);
    const prevBlock = this.get(prevBlockId, false);
    const prevBlockFull = prevBlock?.messages.length === BLOCK_SIZE;
    if (!block && (isFirstBlock || prevBlockFull)) {
      this.set(blockId, [message]);
      if (this.renderBlocks.includes(prevBlockId)) {
        this.renderBlocks.push(blockId);
      }
      return;
    }

    this.fetchCallback(this.roomId, blockId);
    return;
  }

  edit(message: TextMessage) {
    const blockId = getBlockId(message.id);
    const block = this.blocks.get(blockId);
    if (!block) return;
    const index = block.messages.findIndex((m) => m.id === message.id);
    if (index === -1) return;
    block.messages[index] = message;
  }

  delete(messageId: number) {
    const blockId = getBlockId(messageId);
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
      this.fetchCallback(this.roomId, blockId);
    });
  }
}

export class TextMessageCache {
  /** Map of channel ID to room cache */
  cache: SvelteMap<number, TextRoomCache> = new SvelteMap();

  constructor(
    readonly rooms: RoomStore,
    readonly fetchCallback: TextMessageFetchCallback,
  ) {}

  getRoom(roomId: number, create = true) {
    const room = this.cache.get(roomId);
    if (!room && create) {
      tick().then(() => {
        const room = this.rooms.find(roomId);
        if (!room) return;

        const cache = new TextRoomCache(this.rooms, roomId, this.fetchCallback);
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
    roomId: number,
    blockId: number,
    messages: TextMessage[],
    alive: boolean = true,
  ) {
    this.getRoom(roomId)?.set(blockId, messages, alive);
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

  getMessage(roomId: number, messageId: number, fetch = true) {
    return this.getRoom(roomId, false)?.getMessage(messageId, fetch);
  }
}
