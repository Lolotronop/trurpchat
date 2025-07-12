<script lang="ts">
  import AnalyzerDisplay from "./AnalyzerDisplay.svelte";
  import { MIN_DB, type Mic } from "$lib/mic.svelte";
  import Ticks from "./Ticks.svelte";
  import { gitGud } from "$lib/god.svelte";

  const g = gitGud();
  const { mic, rtc } = g;

  const min = -15;
  const max = 30;
  const ticks: number[] = [];
  for (let i = min; i <= max; i += 10) {
    ticks.push(i);
  }
  if (min % 10 !== 0) {
    ticks.push(min);
  }
  if (max % 10 !== 0) {
    ticks.push(max);
  }
  if (!ticks.includes(0)) {
    ticks.push(0);
  }

  $effect(() => {
    mic.connect();
    mic.enableAnalyzer();
    return () => {
      console.log("Disabling mic", rtc.isConnected);
      if (!rtc.isConnected) {
        mic.disconnect();
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
  <div style={mic.speaking ? "filter: brightness(2);" : ""}>
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
