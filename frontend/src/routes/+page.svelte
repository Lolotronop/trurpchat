<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  import BottomControls from "./BottomControls.svelte";
  import RoomList from "./rooms/RoomList.svelte";
  import Stream from "./Stream.svelte";
  import Users from "./Users.svelte";
  import Servers from "./servers/Servers.svelte";
  const g = gitGud();
  // TODO: this needs to be removed with proper
  // "speaking" sending
  g.mic.enableAnalyzer();
</script>

<main class="flex h-screen w-screen">
  <div class="flex h-full flex-col border-r p-2">
    <Servers servers={g.servers} />
  </div>
  <div class="flex h-full min-w-75 flex-col border-r">
    <div class="flex w-full p-2 px-6 text-xl">
      {g.servers.selected?.definition.name || "Select a server"}
    </div>
    <RoomList />
    <div class="w-full p-0.5">
      <BottomControls />
    </div>
  </div>
  <div class="flex h-full w-full flex-col items-center justify-center">
    {#if g.servers.selected?.rtc?.watching}
      <Stream name={g.servers.selected?.rtc?.watching} />
      <div class="flex w-full flex-row justify-between px-16"></div>
    {:else}
      <p>¯\_(ツ)_/¯</p>
    {/if}
  </div>
  <div class="flex h-full">
    <Users
      online={g.servers.selected?.users.online ?? []}
      offline={g.servers.selected?.users.offline ?? []}
    />
  </div>
</main>
