<script lang="ts">
  import type { Room } from "trurpchat-backend";
  import type { TextMessage as TMessage } from "trurpchat-backend";
  import TextMessage from "$lib/components/TextMessage.svelte";
  import type { Server } from "$lib/servers.svelte";
  import { Button } from "$lib/components/ui/button";
  import { StickToBottom } from "$lib/StickToBottom.svelte";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { ArrowRight } from "@lucide/svelte";
  import { untrack } from "svelte";

  type Props = {
    server: Server;
    room: Extract<Room, { type: "text" }>;
  };
  const { server, room }: Props = $props();
  const cache = $derived(server.messages);

  let visibleBlocks = $state<number[]>([]);

  let observer: IntersectionObserver;
  $effect(() => {
    observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          const el = entry.target;
          const block = +el.getAttribute("data-block")!;
          if (entry.isIntersecting && !visibleBlocks.includes(block)) {
            visibleBlocks.push(block);
          } else if (!entry.isIntersecting && visibleBlocks.includes(block)) {
            const index = visibleBlocks.indexOf(block);
            if (index !== -1) {
              visibleBlocks.splice(index, 1);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: "0px",
        threshold: 0.1,
      },
    );
    console.log("effect");
    room;
    const lastMessageId = Math.max(0, untrack(() => room.nextMessageId) - 1);
    const lastBlockId = cache.getBlockId(lastMessageId);
    visibleBlocks = [lastBlockId];

    return () => {
      console.log("destroy");
      observer.disconnect();
    };
  });

  let loadedBlocks = $derived.by(() => {
    const blocks: number[] = visibleBlocks.toSorted((a, b) => a - b);
    if (blocks.length == 0) {
      return blocks;
    }

    if (blocks[0] > 0) {
      const prev = blocks[0] - cache.BLOCK_SIZE;
      blocks.unshift(prev);
    }

    const lastVisibleBlock = blocks[blocks.length - 1];
    if (lastVisibleBlock < cache.lastBlockId(room.id)) {
      const next = lastVisibleBlock + cache.BLOCK_SIZE;
      blocks.push(next);
    }

    return blocks.sort((a, b) => a - b);
  });

  // $inspect(visibleBlocks, loadedBlocks);

  let scrollElement = $state<HTMLElement>();
  let contentElement = $state<HTMLElement>();

  const stickToBottom = new StickToBottom({
    scrollElement: () => scrollElement,
    contentElement: () => contentElement,
    resize: "instant",
    stiffness: 1,
    damping: 1,
    mass: 0.5,
  });

  let text = $state("");

  function sendMessage() {
    if (!text || text.length === 0) {
      return;
    }
    server.gateway.send({
      type: "action.message.create",
      roomId: room.id,
      text,
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
</script>

<div class="flex flex-col gap-2 items-center w-full">
  <Button
    onclick={() => {
    console.dir(cache.cache.get(room.id)?.entries().toArray());
  }}
    >log</Button
  >

  <div class="flex flex-row gap-2">
    {#each cache.cache.get(room.id)?.keys().toArray().toSorted((a, b) => a - b) ?? [] as blockId}
      <Button
        variant={loadedBlocks.includes(blockId) ? 'default' : 'secondary'}
        onclick={() => {
          if (loadedBlocks.includes(blockId)) {
            loadedBlocks = loadedBlocks.filter((id) => id !== blockId);
          } else {
            loadedBlocks = [...loadedBlocks, blockId];
          }
        }}
      >
        {blockId}
      </Button>
    {/each}
  </div>
</div>

<div
  class="h-full w-full flex overflow-y-scroll flex-col"
  bind:this={scrollElement}
>
  <div class="mt-auto" bind:this={contentElement}>
    {#each loadedBlocks as blockId (blockId)}
      {@const block = cache.get(room.id, blockId)}
      {#if block && block.alive}
        <div
          data-block={blockId}
          {@attach (e) => {
          console.log("attach");
          observer.observe(e);
          }}
        >
          {#each partition(block.messages) as part (part[0]?.id)}
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
        <p class="h-20">Loading...</p>
      {/if}
    {/each}

    <div class="h-6"></div>
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
