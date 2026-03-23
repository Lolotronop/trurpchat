<script lang="ts">
  import type { User, TextMessage as TMessage } from "trurpchat-backend";
  import TextMessage from "$lib/components/TextMessage.svelte";
  import type { Server } from "$lib/servers.svelte";
  import BottomControls from "./BottomControls.svelte";
  import VoiceGrid from "./main/VoiceGrid.svelte";
  import RoomList from "./rooms/RoomList.svelte";
  import ServerSettings from "./servers/ServerSettings.svelte";
  import Users from "./Users.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  const mockUsers: User[] = [
    { id: 1, name: "Alice", permissions: 1, deletedAt: null },
    { id: 2, name: "Bob", permissions: 0, deletedAt: null },
    { id: 3, name: "Charlie", permissions: 0, deletedAt: null },
  ];

  const mockMessages: { user: User; message: TMessage }[] = [
    {
      user: mockUsers[0],
      message: {
        id: 1,
        roomId: 1,
        userId: 1,
        text: "Hey everyone! Welcome to the server!",
        replyTo: null,
        createdAt: new Date(Date.now() - 3600000),
        editedAt: null,
        deletedAt: null,
        attachments: null,
      },
    },
    {
      user: mockUsers[1],
      message: {
        id: 2,
        roomId: 1,
        userId: 2,
        text: "Thanks Alice! This place looks great!",
        replyTo: null,
        createdAt: new Date(Date.now() - 3000000),
        editedAt: null,
        deletedAt: null,
        attachments: null,
      },
    },
    {
      user: mockUsers[2],
      message: {
        id: 3,
        roomId: 1,
        userId: 3,
        text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Also here's a second paragraph to make it even longer and test how the message wraps across multiple lines when there's a lot of text in a single message.",
        replyTo: null,
        createdAt: new Date(Date.now() - 2700000),
        editedAt: null,
        deletedAt: null,
        attachments: null,
      },
    },
    {
      user: mockUsers[2],
      message: {
        id: 4,
        roomId: 1,
        userId: 3,
        text: "Agreed! Can't wait to chat with you all.",
        replyTo: null,
        createdAt: new Date(Date.now() - 2400000),
        editedAt: null,
        deletedAt: null,
        attachments: null,
      },
    },
    {
      user: mockUsers[0],
      message: {
        id: 5,
        roomId: 1,
        userId: 1,
        text: "Feel free to join a voice channel whenever you want!",
        replyTo: null,
        createdAt: new Date(Date.now() - 1800000),
        editedAt: null,
        deletedAt: null,
        attachments: null,
      },
    },
  ];
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
      <div class="flex h-full w-full flex-col overflow-y-auto p-2">
        {#each mockMessages as { user, message } (message.id)}
          <TextMessage {user} {message} />
        {/each}
      </div>
    {/if}
  </div>
  <div class="flex h-full border-l p-2">
    <Users
      online={server.users.online ?? []}
      offline={server.users.offline ?? []}
    />
  </div>
</div>
