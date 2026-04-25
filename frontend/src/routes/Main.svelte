<script lang="ts">
  import { tick } from "svelte";
  import type { Server } from "$lib/servers.svelte";

  import BottomControls from "./left/bottom/BottomControls.svelte";
  import RoomList from "./left/rooms/RoomList.svelte";
  import ServerSettings from "./left/servers/ServerSettings.svelte";
  import TextRoomContent from "./middle/text/TextRoomContent.svelte";
  import VoiceGrid from "./middle/voice/VoiceGrid.svelte";
  import Users from "./right/Users.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  // TODO: this hacky
  const cache = $derived.by(() => {
    if (!server.selectedRoom) return;
    if (server.selectedRoom.type !== "text") return;
    const roomCache = server.messages.getRoom(server.selectedRoom.id);
    if (!roomCache) return;
    return roomCache;
  });

  async function showRoom(roomId: number | undefined) {
    if (server.selectedRoomId === roomId) {
      return;
    }

    server.selectedRoomId = undefined;
    await tick();
    server.selectedRoomId = roomId;
  }

  function showCurrentVoiceRoom() {
    const roomId = server.rtc.room?.id;
    if (roomId === undefined) {
      return;
    }

    void showRoom(roomId);
  }
</script>

<div class="flex h-full w-full min-h-0 min-w-0 overflow-hidden">
  <div class="flex h-full shrink-0 flex-col min-w-80 max-w-80 border-r">
    <div class="flex p-2 px-2 text-xl justify-between">
      <p class="pl-2">{server.definition.name || "Select a server"}</p>
      <ServerSettings {server} />
    </div>
    <RoomList {server} bind:selectedRoomId={server.selectedRoomId} />
    <div class="w-full p-0.5"><BottomControls {server} /></div>
  </div>
  <div
    class="flex grow-0 h-full w-full flex-col items-center justify-center min-h-0 min-w-0 overflow-hidden"
  >
    {#if server.selectedRoom?.type === "voice"}
      <VoiceGrid {server} />
    {:else if server.selectedRoom?.type === "text"}
      {@const room = server.rooms.find(server.selectedRoom.id)}
      {#if cache !== undefined && room?.type === "text"}
        <TextRoomContent {cache} {room} {server} {showCurrentVoiceRoom} />
      {/if}
    {:else}
      It is what it is man
    {/if}
  </div>
  <div class="flex h-full shrink-0 overflow-hidden border-l">
    <Users users={server.users} />
  </div>
</div>
