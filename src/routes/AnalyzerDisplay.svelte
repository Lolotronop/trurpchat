<script lang="ts">
  import { MIN_DB } from "$lib/mic.svelte";
  import Ticks from "./Ticks.svelte";

  type Props = {
    rms: number;
    peak: number;
  };
  const { rms, peak }: Props = $props();

  const loudnessSteps: number[] = [];
  for (let i = MIN_DB; i <= 0; i += 10) {
    loudnessSteps.push(i);
  }
  const ticks = loudnessSteps;
</script>

<Ticks {ticks}>
  <div class="relative h-[20px] w-full bg-[#f0f0f0]">
    <div
      class="absolute top-0 left-0 h-full max-w-full bg-red-900 transition-all duration-[{1000 /
        15}ms]"
      style={`width: ${(1 - peak / MIN_DB) * 100}%`}
    ></div>

    <div
      class="absolute top-0 left-0 h-full max-w-full bg-green-900 transition-all duration-[{1000 /
        15}s] ease-in-out"
      style={`width: ${(1 - rms / MIN_DB) * 100}%`}
    ></div>
  </div>
</Ticks>
