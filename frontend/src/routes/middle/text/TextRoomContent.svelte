<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";
  import { onMount, tick } from "svelte";
  import type { TextMessage as TMessage } from "trurpchat-backend";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import Stream from "$lib/components/stream/Stream.svelte";
  import TextMessage from "$lib/components/TextMessage.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Item } from "$lib/components/ui/context-menu";
  import Separator from "$lib/components/ui/separator/separator.svelte";
  import { changedFocus, focused } from "$lib/focus.svelte";
  import { log } from "$lib/log";
  import {
    BLOCK_SIZE,
    getBlockId,
    type TextRoomCache,
  } from "$lib/messages.svelte";
  import type { Server } from "$lib/servers.svelte";
  import { minmax } from "$lib/utils.svelte";
  import TextMessageInput from "./TextMessageInput.svelte";
  import type { TextRoom } from "$lib/rooms.svelte";

  type Props = {
    cache: TextRoomCache;
    server: Server;
    room: TextRoom;
    showCurrentVoiceRoom: () => void;
  };

  const { cache, room, server, showCurrentVoiceRoom }: Props = $props();

  const FUTURE_JUMP_DISTANCE = 200;

  const unreadId = $derived(server.unread.get(room.id));
  const unreadBlockId = $derived(getBlockId(unreadId));
  let newId: number | undefined = $state(undefined);
  let replyTo = $state<TMessage>();
  let inputFocusRequest = $state(0);
  let highlightedMessageId = $state<number>();
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;

  const firstVisibleMessageId = $derived.by(() => {
    for (const blockId of cache.renderBlocks) {
      const messageId = cache.get(blockId, false)?.messages[0]?.id;
      if (messageId !== undefined) {
        return messageId;
      }
    }

    return undefined;
  });
  const showJumpToPresent = $derived(
    firstVisibleMessageId !== undefined &&
      unreadId - firstVisibleMessageId > FUTURE_JUMP_DISTANCE,
  );

  onMount(() => {
    if (cache.renderBlocks.length === 0) {
      const block = Math.min(unreadBlockId, cache.lastBlockId());
      cache.renderBlocks = [block];
    } else if (cache.scrollPosition !== undefined) {
      if (!se) return;
      se.scrollTop = cache.scrollPosition;
    }

    if (unreadId <= cache.lastMessageId()) {
      newId = unreadId;
    }

    return () => {
      observer?.disconnect();
      observer = null;
      clearTimeout(shrinkTimer);
      clearTimeout(highlightTimer);
      cache.visibleBlocks = [];
    };
  });

  let se = $state<HTMLElement>();

  const activeStream = $derived.by(() => {
    for (const userId of server.rtc.room?.users ?? []) {
      const player = server.rtc.streamPlayers.get(userId);
      if (player?.state !== "playing") {
        continue;
      }

      const user = server.users.find(userId);
      if (!user?.online) {
        continue;
      }

      return { user, player };
    }

    return undefined;
  });

  $effect(() => {
    if (!se) return;

    // subscribe to new messages
    const block = cache.get(cache.lastBlockId(), false);
    if (!block?.alive) return;
    block.messages.length;

    if (focused()) {
      if (cache.renderBlocks.length === 0) return;
      const last = cache.renderBlocks[cache.renderBlocks.length - 1];
      if (last !== cache.lastBlockId()) return;
      autoscroll();
    } else {
      if (changedFocus()) {
        newId = unreadId;
        return;
      }
      const first = cache.renderBlocks[0];
      const last = cache.renderBlocks[cache.renderBlocks.length - 1];
      if (first <= unreadId && unreadId <= last) {
        jumpTo(unreadId, false);
      }
    }
  });

  let shouldAutoscroll = $state(false);

  function updateAutoscroll() {
    if (!se) return;
    const lhs = se.offsetHeight + se.scrollTop;
    const rhs = se.scrollHeight - 40;
    shouldAutoscroll = lhs > rhs;
  }

  function markRead() {
    if (unreadId === cache.lastMessageId() + 1) {
      return;
    }
    server.unread.set(room.id, cache.lastMessageId() + 1, 0);
  }

  function autoscroll() {
    if (!se) return;
    if (!shouldAutoscroll) return;
    if (cache.renderBlocks.length === 0) return;
    const last = cache.renderBlocks[cache.renderBlocks.length - 1];
    if (last !== cache.lastBlockId()) return;
    scrollToBottom();
    markRead();
  }

  function scrollToBottom() {
    tick().then(() => {
      if (!se) return;
      se.scrollTo(0, se.scrollHeight);
    });
  }

  function jumpToPresent() {
    if (unreadId === cache.lastMessageId() + 1) {
      const lastBlock = cache.lastBlockId();
      if (!cache.renderBlocks.includes(lastBlock)) {
        cache.renderBlocks = [lastBlock];
      }

      shouldAutoscroll = true;
      scrollToBottom();
    } else {
      jumpTo(unreadId, false);
    }
  }

  function partition(messages: TMessage[]): TMessage[][] {
    const result: TMessage[][] = [];
    let current: TMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (
        current.length === 0 ||
        current.length > 20 ||
        current[current.length - 1].userId !== message.userId ||
        message.createdAt.getTime() -
          current[current.length - 1].createdAt.getTime() >
          2 * 60 * 1000
      ) {
        current = [message];
        result.push(current);
      } else {
        current.push(message);
      }
    }

    return result;
  }

  function preventTopScrollLock() {
    if (!se) return;
    if (cache.renderBlocks.length > 0 && cache.renderBlocks[0] === 0) {
      return;
    }
    const hasScroll = se.scrollHeight > se.clientHeight;
    if (hasScroll && se.scrollTop <= 1) {
      se.scrollTop = 1;
    }
  }

  async function jumpTo(messageId: number, highlight = true) {
    if (highlight) {
      highlightedMessageId = messageId;
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        highlightedMessageId = undefined;
      }, 2000);
    }

    if (!se) return;
    const blockId = getBlockId(messageId);
    if (cache.renderBlocks.includes(blockId)) {
      const element = se.querySelector<HTMLElement>(
        `[data-message="${messageId}"]`,
      );
      if (!element) return;

      let top = element.offsetTop - se.offsetTop;
      if (top < 1) {
        top = 1;
      }

      // if (top > se.scrollHeight - se.clientHeight) {
      //   top = se.scrollHeight - se.clientHeight - element.clientHeight;
      // }

      se.scrollTo({
        top,
      });
    } else if (blockId >= 0 && blockId <= cache.lastBlockId()) {
      cache.renderBlocks = [blockId];
    }
  }

  function debugAllIds() {
    if (!cache) return [];
    const last = cache.lastBlockId();
    const ids = [];
    for (let i = 0; i <= last; i += BLOCK_SIZE) {
      ids.push(i);
    }
    return ids;
  }

  function debugDetermineColor(blockId: number) {
    const block = cache?.get(blockId, false);

    const loaded = block?.alive;
    const rendered = cache?.renderBlocks.includes(blockId);
    const visible = cache?.visibleBlocks.includes(blockId);

    if (visible) {
      return "text-accent";
    }

    if (!loaded && rendered) {
      return "text-yellow-300";
    }

    if (rendered) {
      return "text-blue-300";
    }

    if (!loaded) {
      return "text-destructive";
    }

    return "";
  }

  function handleVisible(entry: IntersectionObserverEntry) {
    if (!entry.target.hasAttribute("data-block")) {
      return;
    }

    const blockId = Number(entry.target.getAttribute("data-block"));
    if (Number.isNaN(blockId)) {
      return;
    }
    const intersecting = entry.isIntersecting;
    const includes = cache.visibleBlocks.includes(blockId);
    if (!se) return;
    const isBottom = se.scrollHeight - se.scrollTop === se.clientHeight;

    if (
      intersecting &&
      isBottom &&
      focused() &&
      blockId === cache.lastBlockId()
    ) {
      markRead();
    }

    if (intersecting && !includes) {
      cache.visibleBlocks.push(blockId);
      expandScope(blockId);
      return;
    }

    if (!intersecting && includes) {
      const index = cache.visibleBlocks.indexOf(blockId);
      if (index !== -1) {
        cache.visibleBlocks.splice(index, 1);
      }
      return;
    }
  }

  function handleLoad(entry: IntersectionObserverEntry) {
    if (!entry.target.hasAttribute("data-block-load")) {
      return;
    }

    if (!entry.isIntersecting) {
      return;
    }

    const blockId = Number(entry.target.getAttribute("data-block-load"));
    if (Number.isNaN(blockId)) {
      return;
    }

    const block = cache.blocks.get(blockId);
    if (!block?.alive) {
      cache.fetch(blockId);
    }

    expandScope(blockId);
  }

  function expandScope(blockId: number) {
    const MAX_BLOCKS = 10;
    const size = BLOCK_SIZE;
    const prev = blockId - size;
    const next = blockId + size;

    const first = cache.renderBlocks[0];
    const last = cache.renderBlocks[cache.renderBlocks.length - 1];
    const len = () => cache.renderBlocks.length;
    if (blockId > 0 && prev === first - size) {
      cache.renderBlocks.unshift(prev);
      if (len() > MAX_BLOCKS) {
        cache.renderBlocks.splice(len() - 1, 1);
      }
    }

    if (blockId < cache.lastBlockId() && next === last + size) {
      cache.renderBlocks.push(next);
      if (len() > MAX_BLOCKS) {
        cache.renderBlocks.splice(0, 1);
      }
    }

    scheduleShrink();
  }

  let shrinkTimer: NodeJS.Timeout | undefined;
  const SHRINK_DELAY = 2 * 60 * 1000;
  // const SHRINK_DELAY = 1000;
  function scheduleShrink() {
    if (shrinkTimer !== undefined) {
      clearTimeout(shrinkTimer);
    }
    shrinkTimer = setTimeout(() => {
      shrinkRenderScope();
    }, SHRINK_DELAY);
  }

  function shrinkRenderScope() {
    const BLOCK_PADDING = 2;
    let [min, max] = minmax(cache.visibleBlocks);
    min = Math.max(0, min - BLOCK_SIZE * BLOCK_PADDING);
    max = Math.min(cache.lastBlockId(), max + BLOCK_SIZE * BLOCK_PADDING);

    let minIdx = 0;
    let maxIdx = cache.renderBlocks.length - 1;
    for (let i = 0; i < cache.renderBlocks.length; i++) {
      const blockId = cache.renderBlocks[i];
      if (blockId === min) {
        minIdx = i;
      }
      if (blockId === max) {
        maxIdx = i;
      }
    }

    cache.renderBlocks.splice(maxIdx + 1);
    cache.renderBlocks.splice(0, minIdx);
  }

  let observer: IntersectionObserver | null = null;
  function createObserver(el: HTMLDivElement) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          handleVisible(entry);
          handleLoad(entry);
        }
      },
      {
        root: el,
        // start preloading messages when the block is
        // still 100px from the top/bottom of the screen
        rootMargin: "0px 100px 0px 100px",
        // rootMargin: "0px",
        threshold: 0,
      },
    );
  }

  function attachBlock(el: Element) {
    preventTopScrollLock();

    observer?.observe(el);
    return () => {
      observer?.unobserve(el);

      if (el.hasAttribute("data-block")) {
        const blockId = Number(el.getAttribute("data-block"));
        const idx = cache?.visibleBlocks.indexOf(blockId);
        if (idx !== -1) {
          cache?.visibleBlocks.splice(idx, 1);
        }
      }
    };
  }
</script>

{#if false && import.meta.env.DEV}
  <div class="flex flex-col gap-2 w-full justify-center">
    <div class="flex-row gap-2">
      {#each debugAllIds() as blockId (blockId)}
        <span class={debugDetermineColor(blockId)}> {`${blockId} `} </span>
      {/each}
    </div>
    <div>
      <button
        type="button"
        onclick={() => {
          log.info($state.snapshot(cache.renderBlocks));
        }}
      >
        Log
      </button>
      <button
        type="button"
        onclick={() => {
          shrinkRenderScope();
        }}
      >
        Shrink
      </button>
      <button
        type="button"
        onclick={() => {
        cache.pruneMemory();
    }}
      >
        Prune
      </button>
    </div>
  </div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative flex h-full w-full min-h-0 flex-col overflow-hidden">
  {#if activeStream}
    <div
      class="pointer-events-none absolute right-4 top-4 z-10 w-[min(24rem,calc(100%-2rem))] sm:w-80"
    >
      <div
        class="group pointer-events-auto overflow-hidden rounded-lg border bg-background/85 shadow-lg backdrop-blur-sm"
        role="button"
        tabindex="0"
        ondblclick={showCurrentVoiceRoom}
        onkeydown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }

          event.preventDefault();
          showCurrentVoiceRoom();
        }}
      >
        <div class="absolute left-2 top-2 z-10">
          <Button
            variant="ghost"
            size="sm"
            class="opacity-0 transition-opacity group-hover:opacity-100 bg-background/80"
            onclick={showCurrentVoiceRoom}
          >
            <ArrowLeft class="size-4" />
          </Button>
        </div>

        <Stream
          {server}
          user={activeStream.user}
          player={activeStream.player}
          shouldHideInfo
          shouldHideUi
        />
      </div>
    </div>
  {/if}

  {#if unreadId <= cache.lastMessageId()}
    {@const diff = cache.lastMessageId() - unreadId + 1}
    <div
      class="bg-accent text-accent-foreground w-full h-fit rounded-b px-2 py-0.5 flex flex-row justify-between gap-20"
    >
      <button
        class="w-full cursor-pointer flex justify-start"
        onclick={() => {
          jumpTo(unreadId);
        }}
      >
        {diff}
        непрочитанных сообщений
      </button>
      <button class="cursor-pointer flex-nowrap text-nowrap" onclick={markRead}>
        Отметить как прочитанное
      </button>
    </div>
  {/if}

  <div
    class="h-full w-full flex overflow-y-scroll flex-col"
    bind:this={se}
    onscroll={(e) => {
      updateAutoscroll();
      preventTopScrollLock();
      const t = e.currentTarget;
      cache.scrollPosition = t.scrollTop;
      const isBottom = t.scrollHeight - t.scrollTop === t.clientHeight;
      cache.isAtBottom = isBottom;
    }}
    {@attach createObserver}
  >
    <div class="h-full flex shrink-0 flex-col relative">
      {#if cache.renderBlocks.length > 0 && cache.renderBlocks[0] !== 0}
        <div style="height:1px;"></div>
      {/if}

      {#if unreadBlockId >= cache.lastBlockId()}
        <div class="h-full flex"></div>
      {/if}

      {#each cache?.renderBlocks as blockId (blockId)}
        {@const block = cache?.get(blockId, false)}
        {#if block?.alive}
          <div data-block={blockId} {@attach attachBlock}>
            {#each partition(block.messages) as part (part[0]?.id ?? 0)}
              {#each part as message (message.id)}
                {#if message.deletedAt === null}
                  {@const isFirst = part.indexOf(message) === 0}
                  {@const isNew = newId === message.id}
                  {@const showHeader = isFirst || isNew || message.replyTo !== null}
                  {@const user = server.users.find(message.userId)}
                  {#if showHeader}
                    <div
                      class="flex flex-row items-center gap-2 px-4 text-xs text-destructive select-none "
                      class:opacity-0={!isNew}
                    >
                      <Separator class="shrink bg-destructive" />
                      Новые
                      <Separator class="shrink bg-destructive" />
                    </div>
                  {/if}
                  <ContextMenu>
                    {#snippet menu()}
                      <Item
                        onclick={() => {
                          replyTo = message;
                          inputFocusRequest += 1;
                        }}
                      >
                        Ответить
                      </Item>
                      <Item
                        onclick={() => {
                          server.unread.set(room.id, message.id);
                          newId = message.id;
                        }}
                      >
                        Отметить непрочитанным
                      </Item>
                    {/snippet}

                    <div data-message={message.id}>
                      <TextMessage
                        {user}
                        {message}
                        {showHeader}
                        currentUserId={server.user.id}
                        users={server.users}
                        replyToMessage={message.replyTo
                          ? cache.getMessage(message.replyTo)
                          : undefined}
                        highlighted={highlightedMessageId === message.id}
                        onReplyClick={jumpTo}
                      />
                    </div>
                  </ContextMenu>
                {/if}
              {/each}
            {/each}
          </div>
        {:else}
          <div
            class="min-h-dvh w-full flex-col flex justify-between"
            data-block-load={blockId}
            {@attach attachBlock}
          >
            <div>Loading... {blockId}</div>
            <div>Loading... {blockId}</div>
          </div>
        {/if}
      {/each}

      {#if unreadBlockId < cache.lastBlockId()}
        <div class="h-full flex"></div>
      {/if}

      <div class="min-h-6"></div>
    </div>
  </div>

  {#if showJumpToPresent}
    <Button
      type="button"
      class="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 shadow-md"
      size="sm"
      onclick={jumpToPresent}
    >
      Назад в будущее
    </Button>
  {/if}

  <TextMessageInput
    {server}
    roomId={room.id}
    roomName={room.name}
    {replyTo}
    focusRequest={inputFocusRequest}
    onCancelReply={() => {
      replyTo = undefined;
    }}
    onSent={() => {
      newId = undefined;
      replyTo = undefined;
    }}
  />
</div>
