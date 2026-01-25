<script lang="ts">
  import { Server } from "$lib/servers.svelte";
  import BottomControls from "./BottomControls.svelte";
  import RoomList from "./rooms/RoomList.svelte";
  import ServerSettings from "./servers/ServerSettings.svelte";
  import Stream from "./Stream.svelte";
  import Users from "./Users.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();
</script>

<div class="flex h-full w-full">
  <div class="flex h-full min-w-75 flex-col border-r">
    <div class="flex w-full p-2 px-6 text-xl justify-between">
      <p>{server.definition.name || "Select a server"}</p>
      <ServerSettings {server} />
    </div>
    <RoomList {server} />
    <div class="w-full p-0.5">
      <BottomControls {server} />
    </div>
  </div>
  <div class="flex h-full w-full flex-col items-center justify-center">
    {#if server.rtc?.watching}
      <Stream {server} id={server.rtc?.watching} />
      <div class="flex w-full flex-row justify-between px-16"></div>
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
