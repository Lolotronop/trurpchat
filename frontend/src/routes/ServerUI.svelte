<script lang="ts">
  import { Server } from "$lib/servers.svelte";
  import BottomControls from "./BottomControls.svelte";
  import VoiceGrid from "./main/VoiceGrid.svelte";
  import RoomForm from "./rooms/RoomForm.svelte";
  import RoomList from "./rooms/RoomList.svelte";
  import ServerSettings from "./servers/ServerSettings.svelte";
  import Users from "./Users.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();
</script>

<div class="flex h-full w-full">
  <div class="flex h-full flex-col min-w-80 border-r">
    <div class="flex p-2 px-2 text-xl justify-between">
      <p class="pl-2">{server.definition.name || "Select a server"}</p>
      <ServerSettings {server} />
    </div>
    <RoomList {server} />
    <div class="w-full p-0.5">
      <BottomControls {server} />
    </div>
  </div>
  <div
    class="flex grow-0 h-full w-full flex-col items-center justify-center min-h-0 min-w-0"
  >
    {#if server.rtc !== undefined}
      <!-- <Stream {server} id={server.rtc?.watching} /> -->
      <!-- <div class="flex w-full flex-row justify-between px-16"></div> -->
      <VoiceGrid {server} />
    {:else}
      <p>¯\_(ツ)_/¯</p>
    {/if}
  </div>
  <div class="flex h-full border-l p-2">
    <Users
      online={server.users.online ?? []}
      offline={server.users.offline ?? []}
    />
  </div>
</div>
