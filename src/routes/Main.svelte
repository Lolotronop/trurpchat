<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  import BottomControls from "./BottomControls.svelte";
  import GainSlider from "./GainSlider.svelte";
  import RoomList from "./RoomList.svelte";
  const g = gitGud();
  // TODO: this needs to be removed with proper
  // "speaking" sending
  g.mic.enableAnalyzer();
</script>

<main class="flex h-screen w-screen">
  <div class="flex h-full min-w-[300px] flex-col border-r">
    <div class="flex w-full p-2 px-6 text-xl">ТРУРПЧР</div>
    <RoomList />
    <div class="w-full p-0.5">
      <BottomControls />
    </div>
  </div>
  <div class="flex h-full w-full items-center justify-center">:)</div>
</main>
