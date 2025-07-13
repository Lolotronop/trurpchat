<script lang="ts">
  import AnalyzerDisplay from "./AnalyzerDisplay.svelte";
  import { MIN_DB, type Mic } from "$lib/mic.svelte";
  import Ticks from "./Ticks.svelte";
  import { gitGud } from "$lib/god.svelte";
  import { toDb } from "$lib/utils.svelte";

  const g = gitGud();
  const { mic, rtc } = g;

  const min = -15;
  const max = 30;
  const ticks: number[] = [];
  for (let i = min; i <= max; i += 10) {
    ticks.push(i);
  }
  if (!ticks.includes(min)) {
    ticks.push(min);
  }
  if (!ticks.includes(max)) {
    ticks.push(max);
  }
  if (!ticks.includes(0)) {
    ticks.push(0);
  }

  let reduction = $state(0);
  setInterval(() => {
    const r = mic.nodes.limiter.reduction;
    reduction = toDb(1 - r);
  }, 33.33);

  $effect(() => {
    mic.connect();
    mic.enableAnalyzer();
    return () => {
      console.log("Disabling mic", rtc.isConnected);
      if (!rtc.isConnected) {
        mic.disconnect();
        // FIXME: this doesn't update back up if the gate is currently open
        // but that doesn't matter that much
        mic.speaking = false;
      }
      mic.disableAnalyzer();
    };
  });
</script>

<div class="flex w-full flex-col gap-4">
  <div class="">
    <Ticks {ticks}>
      <input
        type="range"
        class="w-full"
        {min}
        {max}
        step="0.1"
        ondblclick={() => {
          mic.gain = 0;
        }}
        bind:value={mic.gain}
      />
    </Ticks>
  </div>
  <div class="relative h-4 w-full bg-amber-50">
    <div
      class="absolute top-0 right-0 bottom-0 left-0 max-w-full bg-amber-500"
      style={`width: ${(1 - reduction / -MIN_DB) * 100}%`}
    ></div>
  </div>
  <div style={mic.speaking ? "filter: brightness(2);" : ""} class="mb-4">
    <AnalyzerDisplay rms={mic.loudnessLevel} peak={mic.loudnessPeakLevel} />
  </div>
  <input
    type="range"
    class="w-full"
    min={MIN_DB}
    max="0"
    step="0.1"
    bind:value={mic.gateThreshold}
  />
</div>

<style>
  /* Thumb styling for WebKit-based browsers */
  :global(input[type="range"]::-webkit-slider-thumb) {
    -webkit-appearance: none;
    border: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: goldenrod;
    margin-top: -4px;
  }
  /* Thumb styling for Firefox */
  input[type="range"]::-moz-range-thumb {
    width: 1rem;
    height: 1rem;
    background-color: #3b82f6;
    border-radius: 9999px;
    border: 2px solid white;
    cursor: pointer;
  }
</style>
