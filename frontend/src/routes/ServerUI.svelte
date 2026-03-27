<script lang="ts">
  import type { Server } from "$lib/servers.svelte";
  import BottomControls from "./BottomControls.svelte";
  import VoiceGrid from "./main/VoiceGrid.svelte";
  import RoomList from "./rooms/RoomList.svelte";
  import ServerSettings from "./servers/ServerSettings.svelte";
  import Users from "./Users.svelte";
  import TextRoomContent from "./rooms/TextRoomContent.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  const onlineUsers = $derived(server.users.filter((u) => u.online));
  const offlineUsers = $derived(server.users.filter((u) => !u.online));

  let selectedRoomId: number | undefined = $state(undefined);
  const selectedRoom = $derived(
    server.rooms.find((r) => r.id === selectedRoomId),
  );
</script>

<div class="flex h-full w-full">
  <div class="flex h-full flex-col min-w-80 border-r">
    <div class="flex p-2 px-2 text-xl justify-between">
      <p class="pl-2">{server.definition.name || "Select a server"}</p>
      <ServerSettings {server} />
    </div>
    <RoomList {server} bind:selectedRoomId />
    <div class="w-full p-0.5"><BottomControls {server} /></div>
  </div>
  <div
    class="flex grow-0 h-full w-full flex-col items-center justify-center min-h-0 min-w-0"
  >
    {#if selectedRoom?.type === "voice"}
      <!-- <Stream {server} id={server.rtc?.watching} /> -->
      <!-- <div class="flex w-full flex-row justify-between px-16"></div> -->
      <VoiceGrid {server} />
    {:else if selectedRoom?.type === "text"}
      <TextRoomContent {server} room={selectedRoom} />
    {:else}
      It is what it is man
    {/if}
  </div>
  <div class="flex h-full border-l p-2">
    <Users online={onlineUsers ?? []} offline={offlineUsers ?? []} />
  </div>
</div>
