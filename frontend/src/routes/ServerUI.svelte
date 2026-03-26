<script lang="ts">
  import type { User, TextMessage as TMessage } from "trurpchat-backend";
  import TextMessage from "$lib/components/TextMessage.svelte";
  import type { Server } from "$lib/servers.svelte";
  import BottomControls from "./BottomControls.svelte";
  import VoiceGrid from "./main/VoiceGrid.svelte";
  import RoomList from "./rooms/RoomList.svelte";
  import ServerSettings from "./servers/ServerSettings.svelte";
  import Users from "./Users.svelte";
  import { TextMessageCache } from "$lib/messages.svelte";
  import { Button } from "$lib/components/ui/button";
  import { StickToBottom } from "$lib/StickToBottom.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  const mockUsers: User[] = [
    { id: 1, name: "Alice", permissions: 1, deletedAt: null },
    { id: 2, name: "Bob", permissions: 0, deletedAt: null },
    { id: 3, name: "Charlie", permissions: 0, deletedAt: null },
  ];

  const mockMessageBase: TMessage[] = [
    {
      id: 0,
      roomId: 1,
      userId: 1,
      text: "Hey everyone! Welcome to the server!",
      replyTo: null,
      createdAt: new Date(Date.now() - 3600000),
      editedAt: null,
      deletedAt: null,
      attachments: null,
    },
    {
      id: 1,
      roomId: 1,
      userId: 2,
      text: "Thanks Alice! This place looks great!",
      replyTo: null,
      createdAt: new Date(Date.now() - 3000000),
      editedAt: null,
      deletedAt: null,
      attachments: null,
    },
    {
      id: 2,
      roomId: 1,
      userId: 3,
      text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Also here's a second paragraph to make it even longer and test how the message wraps across multiple lines when there's a lot of text in a single message.",
      replyTo: null,
      createdAt: new Date(Date.now() - 2700000),
      editedAt: null,
      deletedAt: null,
      attachments: null,
    },
    {
      id: 3,
      roomId: 1,
      userId: 3,
      text: "Agreed! Can't wait to chat with you all.",
      replyTo: null,
      createdAt: new Date(Date.now() - 2400000),
      editedAt: null,
      deletedAt: null,
      attachments: null,
    },
    {
      id: 4,
      roomId: 1,
      userId: 1,
      text: "Feel free to join a voice channel whenever you want!",
      replyTo: null,
      createdAt: new Date(Date.now() - 1800000),
      editedAt: null,
      deletedAt: null,
      attachments: null,
    },
    {
      id: 5,
      roomId: 1,
      userId: 1,
      text: "This is a test message to see if it works",
      replyTo: null,
      createdAt: new Date(Date.now() - 1400000),
      editedAt: null,
      deletedAt: null,
      attachments: null,
    },
    {
      id: 6,
      roomId: 1,
      userId: 2,
      text: "Another one. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Also here's a second paragraph to make it even longer and test how the message wraps across multiple lines when there's a",
      replyTo: null,
      createdAt: new Date(Date.now() - 1000000),
      editedAt: null,
      deletedAt: null,
      attachments: null,
    },
  ];

  let mockMessages: TMessage[] = [];

  const COUNT = 200;
  for (let i = 0; i < COUNT; i++) {
    mockMessages.push({
      id: i,
      roomId: 1,
      userId: mockUsers[i % mockUsers.length].id,
      text:
        i.toString() + " " + mockMessageBase[i % mockMessageBase.length].text,
      replyTo: null,
      createdAt: new Date(Date.now() - i * 1000),
      editedAt: null,
      deletedAt: null,
      attachments: null,
    });
  }

  let nextId = COUNT;

  const cache = new TextMessageCache();
  cache.onfetchrequest = (channelId, blockId) => {
    setTimeout(() => {
      cache.set(
        channelId,
        blockId,
        mockMessages.slice(blockId, blockId + cache.BLOCK_SIZE),
      );
    }, 1000);
  };

  const channelId = 1;

  const lastMockMessageId = mockMessages.length - 1;
  const lastMockBlockId =
    lastMockMessageId - (lastMockMessageId % cache.BLOCK_SIZE);
  let visibleBlocks = $state<number[]>([lastMockBlockId]);
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        // element became visible: do X
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
        // console.log(
        //   "Intersecting Block",
        //   block,
        //   entry.isIntersecting,
        //   $state.snapshot(visibleBlocks),
        // );
      });
    },
    {
      root: null, // viewport
      rootMargin: "0px", // margin around root
      threshold: 0.1, // visible when 10% visible; use 0 for any visibility
    },
  );

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
    if (lastVisibleBlock < cache.lastBlockId(channelId)) {
      const next = lastVisibleBlock + cache.BLOCK_SIZE;
      blocks.push(next);
    }

    return blocks.sort((a, b) => a - b);
  });

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
</script>

<div class="flex h-full w-full">
  <div class="flex h-full flex-col min-w-80 border-r">
    <div class="flex p-2 px-2 text-xl justify-between">
      <p class="pl-2">{server.definition.name || "Select a server"}</p>
      <ServerSettings {server} />
    </div>
    <RoomList {server} />
    <div class="w-full p-0.5"><BottomControls {server} /></div>
  </div>
  <div
    class="flex grow-0 h-full w-full flex-col items-center justify-center min-h-0 min-w-0"
  >
    {#if server.rtc !== undefined}
      <!-- <Stream {server} id={server.rtc?.watching} /> -->
      <!-- <div class="flex w-full flex-row justify-between px-16"></div> -->
      <VoiceGrid {server} />
    {:else}
      <div class="flex flex-col gap-2 items-center w-full">
        <div class="flex flex-row gap-2">
          {#each cache.cache.get(channelId)?.keys().toArray().toSorted((a, b) => a - b) ?? [] as blockId}
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
        <Button
          onclick={() => {
            const rnd = Math.random();
            const id = nextId++;
            cache.append(channelId, {
              id,
              roomId: channelId,
              userId: 1,
              text: id + " " + mockMessageBase[id % mockMessageBase.length].text,
              replyTo: null,
              createdAt: new Date(),
              editedAt: null,
              deletedAt: null,
              attachments: null,
            })
          }}
        >
          Add msg
        </Button>
      </div>

      <div
        class="h-full w-full flex overflow-y-scroll flex-col"
        bind:this={scrollElement}
      >
        <div class="mt-auto" bind:this={contentElement}>
          {#each loadedBlocks as blockId (blockId)}
            {@const block = cache.get(channelId, blockId)}
            {#if block && block.alive}
              <div
                data-block={blockId}
                class="display-content"
                {@attach (e) => {
                observer.observe(e);
                }}
              >
                {#each block.messages as message (message.id)}
                  {#if message.deletedAt === null}
                    {@const user = mockUsers.find((u) => u.id === message.userId)}
                    <TextMessage {user} {message} />
                  {/if}
                {/each}
              </div>
            {:else}
              <p>Loading...</p>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </div>
  <div class="flex h-full border-l p-2">
    <Users
      online={server.onlineUsers ?? []}
      offline={server.offlineUsers ?? []}
    />
  </div>
</div>
