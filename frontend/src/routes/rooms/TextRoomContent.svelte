<script lang="ts">
  import type { Room } from "trurpchat-backend";
  import type { TextMessage as TMessage } from "trurpchat-backend";
  import TextMessage from "$lib/components/TextMessage.svelte";
  import type { Server } from "$lib/servers.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { ArrowRight } from "@lucide/svelte";
  import { untrack } from "svelte";
  import type { TextRoomCache } from "$lib/messages.svelte";

  type Props = {
    server: Server;
    room: Extract<Room, { type: "text" }>;
  };

  const { server, room }: Props = $props();
  const cache = $derived(server.messages);
  let roomCache: TextRoomCache | undefined = $state(undefined);
  $effect(() => {
    if (!roomCache || roomCache.room.id !== room.id) {
      console.log("creating room cache");
      roomCache = cache.getRoom(room.id);

      untrack(() => {
        if (!roomCache) return;
        roomCache.initialize();

        const hasScroll = roomCache.scrollPosition !== undefined;
        const isLast =
          roomCache.visibleBlocks[roomCache.visibleBlocks.length - 1] ===
          roomCache.lastBlockId();

        if (hasScroll) {
          scrollElement?.scrollTo({
            behavior: "instant",
            top: roomCache.scrollPosition,
          });
        }
      });
    }

    return () => {
      console.log("destroying");
      // server.messages.cache.delete(room.id);
    };
  });

  let scrollElement = $state<HTMLElement>();
  let contentElement = $state<HTMLElement>();

  let text = $state("");

  function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length === 0) {
      return;
    }
    server.gateway.send({
      type: "action.message.create",
      roomId: room.id,
      text: trimmed,
    });
    text = "";
  }

  let textarea = $state<HTMLTextAreaElement>();

  const MINUTES = 60 * 1000;

  function partition(messages: TMessage[]): TMessage[][] {
    const result: TMessage[][] = [];
    let current: TMessage[] = [];
    for (const message of messages) {
      if (
        current.length === 0 ||
        current.length > 20 ||
        current[current.length - 1].userId !== message.userId ||
        message.createdAt.getTime() -
          current[current.length - 1].createdAt.getTime() >
          2 * MINUTES
      ) {
        current = [message];
        result.push(current);
      } else {
        current.push(message);
      }
    }

    return result;
  }

  function allIds() {
    if (!roomCache) return [];
    const last = roomCache.lastBlockId();
    const ids = [];
    for (let i = 0; i <= last; i += roomCache.parent.BLOCK_SIZE) {
      ids.push(i);
    }
    return ids;
  }

  function determineColor(blockId: number) {
    const block = roomCache?.get(blockId, false);

    const loaded = block && block.alive;
    const rendered = roomCache?.renderBlocks.includes(blockId);
    const visible = roomCache?.visibleBlocks.includes(blockId);

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

  function jumpTo(id: number) {
    if (!roomCache) return;
    console.log("---jumpTo", id);
    if (!roomCache.renderBlocks.includes(id)) {
      roomCache.renderBlocks = [id];
    } else {
      const el = document.querySelector(`[data-block="${id}"]`);
      if (el) {
        el.scrollIntoView();
      }
    }
  }

  let lastHasScroll = false;
</script>

<div class="flex flex-col gap-2 w-full justify-center">
  <button
    onclick={() => {
      jumpTo(30);
    }}
  >
    jump to 30
  </button>
  <button
    onclick={() => {
      jumpTo(roomCache?.lastBlockId() ?? 0);
    }}
  >
    jump to {roomCache?.lastBlockId() ?? 0}
  </button>
  <div class="flex-row gap-2">
    {#each allIds() as blockId}
      <span class={determineColor(blockId)}> {blockId + " "} </span>
    {/each}
  </div>
</div>

<div
  class="h-full w-full flex overflow-y-scroll flex-col"
  bind:this={scrollElement}
  onscroll={(e) => {
    if (!roomCache) return;
    const el = e.currentTarget;

    // prevent the browser from locking up at the top
    // when loading messages
    if (el.scrollTop < 50) {
      const r = roomCache.renderBlocks;
      const first = roomCache.get(r[0], false);
      if (!first) return;
      if (el.scrollTop === 0 && first.messages.length == 0) {
        el.scrollTo({
          behavior: "instant",
          top: 1,
        });
      }
    }

    roomCache.scrollPosition = el.scrollTop;
  }}
>
  <div class="h-full flex shrink-0 flex-col" bind:this={contentElement}>
    <div class="h-full flex flex-col-reverse bg-yellow-100/20"></div>
    {#each roomCache?.renderBlocks.toSorted((a, b) => a - b) as blockId (blockId)}
      {@const block = roomCache?.get(blockId, false)}
      {#if block && block.alive}
        <div data-block={blockId} {@attach roomCache?.attachBlock}>
          {#each partition(block.messages) as part (part[0]?.id)}
            {#each part as message (message.id)}
              {#if message.deletedAt === null}
                {@const isFirst = part.indexOf(message) === 0}
                {@const user = server.findUser(message.userId)}
                <div
                  class="contents"
                  {@attach (_) => {
                    if (!scrollElement) return;
                    const el = scrollElement;
                    const hasScroll = el.scrollHeight > el.clientHeight;
                    // prevents the browser from locking up at the top
                    // loading messages in a loop, up to the first one
                    if (hasScroll && el.scrollTop < 1) {
                      scrollElement.scrollTo({
                        behavior: "instant",
                        top: 1,
                      });
                    }

                    // stick to bottom behavior
                    const fromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
                    if (hasScroll && fromBottom < 100) {
                      scrollElement.scrollTo({
                        behavior: "instant",
                        top: el.scrollTop + fromBottom,
                      });
                    }

                    lastHasScroll = hasScroll;

                    return () => {
                      lastHasScroll = el.scrollHeight > el.clientHeight;
                    };
                  }}
                >
                  <TextMessage {user} {message} showHeader={isFirst} />
                </div>
              {/if}
            {/each}
          {/each}
        </div>
      {:else}
        <div
          class="min-h-screen w-full flex-col flex justify-between bg-accent/20"
          data-block-load={blockId}
          {@attach (e) => {
            roomCache?.attachBlock(e);

            if (!scrollElement) return;
            const el = scrollElement;

            const isTop = el.scrollHeight > el.clientHeight && el.scrollTop < 1;
            console.log("lastHasScroll", lastHasScroll);
            if (isTop && !lastHasScroll) {
              console.log("scrolling to bottom", blockId);
              const fromBottom =
                el.scrollHeight - el.clientHeight - el.scrollTop;
              scrollElement.scrollTo({
                behavior: "instant",
                top: el.scrollTop + fromBottom,
              });
            }
          }}
        >
          <div>Loading... {blockId}</div>
          <div>Loading... {blockId}</div>
        </div>
      {/if}
    {/each}

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
      placeholder={`#${room.name}`}
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
