import { tick } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { TextMessage } from "trurpchat-backend";

type TextMessageBlock = {
  messages: TextMessage[];
  /** Whether the block is in sync with the server
   * This is set to false when the block loads from cache
   * on startup, and only becomes true when it is re-fetched
   * from the server
   */
  alive: boolean;
};

export class TextMessageCache {
  BLOCK_SIZE = 10;
  /** Map of channel ID to map of block ID's to messages in that block */
  cache: SvelteMap<number, SvelteMap<number, TextMessageBlock>> =
    new SvelteMap();

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

  inFlightBlocks = new Set<number>();

  fetch(channelId: number, blockId: number) {
    if (this.inFlightBlocks.has(blockId)) {
      return;
    }
    this.inFlightBlocks.add(blockId);
    tick().then(() => {
      this.onfetchrequest(channelId, blockId);
    });
  }

  getChannel(channelId: number, create = true) {
    const channel = this.cache.get(channelId);
    if (!channel && create) {
      tick().then(() => {
        this.cache.set(channelId, new SvelteMap());
      });
    }
    return channel;
  }

  get(channelId: number, blockId: number, fetch = true) {
    this.checkBlockId(blockId);

    const channel = this.getChannel(channelId);
    if (!channel) return;

    const block = channel.get(blockId);
    if (!block) {
      if (fetch) this.fetch(channelId, blockId);
    }
    return block;
  }

  /** Sets the block to be alive by default */
  set(
    channelId: number,
    blockId: number,
    messages: TextMessage[],
    alive: boolean = true,
  ) {
    this.checkBlockId(blockId);
    this.inFlightBlocks.delete(blockId);

    let channel = this.getChannel(channelId, false);
    tick().then(() => {
      if (!channel) {
        channel = new SvelteMap();
        this.cache.set(channelId, channel);
      }
      channel.set(blockId, { messages, alive });
    });
  }

  append(message: TextMessage) {
    const roomId = message.roomId;
    const blockId = message.id - (message.id % this.BLOCK_SIZE);
    this.checkBlockId(blockId);
    let block = this.get(roomId, blockId, false);

    // handles the case where a new message creates a new block
    // when the previous block is already full, or
    // when the current block is the first block of the channel.
    // this means that we can safely create an empty alive block
    // and append the message to it
    const prevBlockId = Math.max(0, blockId - this.BLOCK_SIZE);
    const prevBlock = this.get(roomId, prevBlockId, false);
    const isFirstBlock = blockId === 0;
    const prevBlockFull = prevBlock?.messages.length === this.BLOCK_SIZE;

    if (!block && (isFirstBlock || prevBlockFull)) {
      block = { messages: [], alive: true };
    }

    if (!block?.alive) {
      this.fetch(roomId, blockId);
      return;
    }

    block.messages.push(message);
    this.set(roomId, blockId, block.messages);
  }

  edit(message: TextMessage) {
    const room = this.getChannel(message.roomId, false);
    if (!room) return;
    const blockId = this.getBlockId(message.id);
    const block = room.get(blockId);
    if (!block) return;
    const index = block.messages.findIndex((m) => m.id === message.id);
    if (index === -1) return;
    block.messages[index] = message;
  }

  delete(roomId: number, messageId: number) {
    const room = this.getChannel(roomId, false);
    if (!room) return;
    const blockId = this.getBlockId(messageId);
    const block = room.get(blockId);
    if (!block) return;
    const index = block.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;
    block.messages[index].deletedAt = new Date();
    block.messages[index].text = "";
    block.messages[index].replyTo = null;
    block.messages[index].attachments = null;
  }

  lastMessageId(channelId: number) {
    const channel = this.getChannel(channelId);

    if (!channel) return 0;

    const lastBlockId = channel.keys().toArray().pop();
    if (!lastBlockId) return 0;

    const lastBlock = channel.get(lastBlockId);

    if (!lastBlock) return 0;

    return lastBlock.messages[lastBlock.messages.length - 1]?.id ?? 0;
  }

  lastBlockId(channelId: number) {
    const channel = this.getChannel(channelId);

    if (!channel) return 0;

    const lastBlockId = channel
      .keys()
      .toArray()
      .sort((a, b) => b - a)[0];
    if (!lastBlockId) return 0;

    return lastBlockId;
  }
}
