<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { gitGud } from "$lib/god.svelte";
  import BottomControls from "./BottomControls.svelte";
  import RoomList from "./RoomList.svelte";
  import Stream from "./Stream.svelte";
  const g = gitGud();
  // TODO: this needs to be removed with proper
  // "speaking" sending
  g.mic.enableAnalyzer();
  let showStream = $state(false);
</script>

<main class="flex h-screen w-screen">
  <div class="flex h-full min-w-[300px] flex-col border-r">
    <div class="flex w-full p-2 px-6 text-xl">ТРУРПЧР</div>
    <RoomList />
    <div class="w-full p-0.5">
      <BottomControls />
    </div>
  </div>
  <div class="flex h-full w-full flex-col items-center justify-center">
    {#if g.rtc.watching}
      <Stream name={g.rtc.watching} />
      <Button onclick={() => (g.rtc.watching = null)}>Выйти</Button>
    {:else}
      <p>¯\_(ツ)_/¯</p>
    {/if}
  </div>
</main>
