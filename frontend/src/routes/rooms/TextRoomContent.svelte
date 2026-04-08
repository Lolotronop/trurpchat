<script lang="ts">
  import { ArrowLeft, ArrowRight } from "@lucide/svelte";
  import type { TextMessage as TMessage } from "trurpchat-backend";
  import Stream from "$lib/components/stream/Stream.svelte";
  import type { TextRoomCache } from "$lib/messages.svelte";
  import { onMount, tick } from "svelte";
  import TextMessage from "$lib/components/TextMessage.svelte";
  import type { Server } from "$lib/servers.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";

  type Props = {
    cache: TextRoomCache;
    server: Server;
    showCurrentVoiceRoom: () => void;
  };

  const { cache, server, showCurrentVoiceRoom }: Props = $props();

  let target: number = $state(cache.lastBlockId());
  let targetMsg = $state(0);
  // let target = $state(0);

  onMount(() => {
    if (cache.renderBlocks.length === 0) {
      cache.renderBlocks = [cache.lastBlockId()];
    } else if (cache.scrollPosition !== undefined) {
      if (!se) return;
      se.scrollTop = cache.scrollPosition;
    }

    return () => {
      observer?.disconnect();
      observer = null;
    };
    // cache.renderBlocks = [cache.lastBlockId()];
  });

  let se = $state<HTMLElement>();
  let text = $state("");
  let textarea = $state<HTMLTextAreaElement>();

  const activeStream = $derived.by(() => {
    for (const userId of server.rtc.room?.users ?? []) {
      const player = server.rtc.streamPlayers.get(userId);
      if (player?.state !== "playing") {
        continue;
      }

      const user = server.findUser(userId);
      if (!user?.online) {
        continue;
      }

      return { user, player };
    }

    return undefined;
  });

  function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length === 0) {
      return;
    }
    server.gateway.send({
      type: "action.message.create",
      roomId: cache.room.id,
      text: trimmed,
    });
    text = "";
  }

  $effect(() => {
    if (!se) return;
    if (cache.renderBlocks.length === 0) return;
    const last = cache.renderBlocks[cache.renderBlocks.length - 1];
    if (last !== cache.lastBlockId()) return;
    const block = cache.get(cache.lastBlockId(), false);
    if (!block) return;
    block.messages.length;
    autoscroll();
  });

  let shouldAutoscroll = $state(false);

  function updateAutoscroll() {
    if (!se) return;
    const lhs = se.offsetHeight + se.scrollTop;
    const rhs = se.scrollHeight - 40;
    shouldAutoscroll = lhs > rhs;
  }

  function autoscroll() {
    if (!se) return;
    if (!shouldAutoscroll) return;
    if (cache.renderBlocks.length === 0) return;
    const last = cache.renderBlocks[cache.renderBlocks.length - 1];
    if (last !== cache.lastBlockId()) return;
    scrollToBottom();
  }

  function scrollToBottom() {
    tick().then(() => {
      if (!se) return;
      se.scrollTo(0, se.scrollHeight);
    });
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

  function debugAllIds() {
    if (!cache) return [];
    const last = cache.lastBlockId();
    const ids = [];
    for (let i = 0; i <= last; i += cache.parent.BLOCK_SIZE) {
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
    const isIntersecting = entry.isIntersecting;

    if (isIntersecting && !cache.visibleBlocks.includes(blockId)) {
      cache.visibleBlocks.push(blockId);
    }

    if (!isIntersecting && cache.visibleBlocks.includes(blockId)) {
      const index = cache.visibleBlocks.indexOf(blockId);
      if (index !== -1) {
        cache.visibleBlocks.splice(index, 1);
      }
    }

    expandScope(blockId);
  }

  function handleLoad(entry: IntersectionObserverEntry) {
    if (!entry.target.hasAttribute("data-block-load")) {
      return;
    }

    const blockId = Number(entry.target.getAttribute("data-block-load"));
    if (!entry.isIntersecting || Number.isNaN(blockId)) {
      return;
    }

    const block = cache.blocks.get(blockId);
    if (!block?.alive) {
      cache.fetch(blockId);
    }

    expandScope(blockId);
  }

  function expandScope(blockId: number) {
    const size = cache.parent.BLOCK_SIZE;
    const prev = blockId - size;
    const next = blockId + size;

    const first = cache.renderBlocks[0];
    const last = cache.renderBlocks[cache.renderBlocks.length - 1];
    if (blockId !== 0 && prev === first - size) {
      cache.renderBlocks.unshift(prev);
    }

    if (blockId !== cache.lastBlockId() && next === last + size) {
      cache.renderBlocks.push(next);
    }
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
      {#each debugAllIds() as blockId}
        <span class={debugDetermineColor(blockId)}> {`${blockId} `} </span>
      {/each}
    </div>
    <input type="number" bind:value={targetMsg}>
    <button
      type="button"
      onclick={async () => {
      target = cache.parent.getBlockId(targetMsg);
      cache.renderBlocks = [];
      shouldAutoscroll = false;
      await tick();
      cache.renderBlocks = [target];
    }}
    >
      Jump
    </button>
    <button
      type="button"
      onclick={() => {
      console.log($state.snapshot(cache.renderBlocks));
    }}
    >
      Log
    </button>
  </div>
{/if}

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

  <div
    class="h-full w-full flex overflow-y-scroll flex-col"
    bind:this={se}
    onscroll={(e) => {
      updateAutoscroll();
      preventTopScrollLock();
      cache.scrollPosition = e.currentTarget.scrollTop;
    }}
    {@attach createObserver}
  >
    <div class="h-full flex shrink-0 flex-col">
      {#if cache.renderBlocks.length > 0 && cache.renderBlocks[0] !== 0}
        <div style="height:1px;"></div>
      {/if}

      {#if target === cache.lastBlockId()}
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
                  {@const user = server.findUser(message.userId)}
                  <TextMessage {user} {message} showHeader={isFirst} />
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

      {#if target !== cache.lastBlockId()}
        <div class="h-full flex"></div>
      {/if}

      <div class="min-h-6"></div>
    </div>
  </div>

  <div class="flex flex-row w-full pb-2 px-2">
    <InputGroup.Root
      class="min-h-12 cursor-text"
      onclick={() => {
        if (textarea) {
          textarea.focus();
        }
      }}
    >
      <textarea
        data-slot="input-group-control"
        class="flex field-sizing-content w-full px-3 py-2 resize-none rounded-md bg-transparent text-base transition-[color,box-shadow] outline-none md:text-sm"
        placeholder={`#${cache.room.name}`}
        bind:value={text}
        bind:this={textarea}
        onkeydown={(e) => {
          const holdsModifier = e.ctrlKey || e.metaKey || e.shiftKey;
          if (!holdsModifier && e.key === "Enter") {
            e.preventDefault();
            sendMessage();
          }
        }}
      ></textarea>
      <InputGroup.Addon align="inline-end" class="">
        <Button
          disabled={!text || text.length === 0}
          class="ms-auto h-full!"
          size="sm"
          variant="ghost"
          onclick={sendMessage}
        >
          <ArrowRight />
        </Button>
      </InputGroup.Addon>
    </InputGroup.Root>
  </div>
</div>
