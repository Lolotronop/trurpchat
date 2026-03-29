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
  const roomCache = $derived(cache.getRoom(room.id));
  $effect(() => {
    if (roomCache) {
      untrack(() => {
        roomCache.initialize(room.nextMessageId);

        const hasScroll = roomCache.scrollPosition !== undefined;

        if (hasScroll) {
          scrollElement?.scrollTo({
            behavior: "instant",
            top: roomCache.scrollPosition,
          });
        }

        const stickToBottom = new StickToBottom({
          scrollElement: () => scrollElement,
          contentElement: () => contentElement,
          resize: "instant",
          stiffness: 1,
          damping: 1,
          mass: 0.5,
          initial: !hasScroll,
        });
      });
    }
  });

  let scrollElement = $state<HTMLElement>();
  let contentElement = $state<HTMLElement>();

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
      console.dir(roomCache?.blocks.entries().toArray());
    }}>log</Button
  >

  <div class="flex flex-row gap-2">
    {#each roomCache?.blocks
      .keys()
      .toArray()
      .toSorted((a, b) => a - b) as blockId}
      <Button
        variant={roomCache?.loadedBlocks.includes(blockId)
          ? "default"
          : "secondary"}
      >
        {blockId}
      </Button>
    {/each}
  </div>
</div>

<div
  class="h-full w-full flex overflow-y-scroll flex-col"
  bind:this={scrollElement}
  onscroll={(e) => {
    if (!roomCache) return;
    roomCache.scrollPosition = e.currentTarget.scrollTop;
  }}
>
  <div class="mt-auto" bind:this={contentElement}>
    {#each roomCache?.loadedBlocks as blockId (blockId)}
      {@const block = roomCache?.get(blockId)}
      {#if block && block.alive}
        <div data-block={blockId} {@attach roomCache?.attachBlock}>
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
