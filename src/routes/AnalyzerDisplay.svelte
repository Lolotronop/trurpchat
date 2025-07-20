<script lang="ts">
  import { MIN_DB } from "$lib/mic.svelte";
  import Ticks from "./Ticks.svelte";

  type Props = {
    rms: number;
    peak: number;
  };
  const { rms, peak }: Props = $props();

  const loudnessSteps: number[] = [
    0, -6, -12, -18, -24, -30, -36, -42, -48, -54,
  ];
  const ticks = loudnessSteps;
  const dur = Math.floor(1000 / 120);
</script>

<Ticks {ticks}>
  <div class="bg-muted relative h-[20px] w-full">
    <div
      class="absolute top-0 left-0 h-full max-w-full bg-red-700"
      style={`width: ${(1 - peak / MIN_DB) * 100}%`}
    ></div>

    <div
      class="absolute top-0 left-0 h-full max-w-full bg-green-700"
      style={`width: ${(1 - rms / MIN_DB) * 100}%`}
    ></div>
  </div>
</Ticks>
