<script lang="ts">
  import { MIN_DB } from "./localAudioManager.svelte";

  type Props = {
    rms: number;
    peak: number;
  };
  const { rms, peak } = $props();

  const loudnessSteps: number[] = [];
  for (let i = MIN_DB; i <= 0; i += 10) {
    loudnessSteps.push(i);
  }
</script>

<div class="relative h-[20px] w-full bg-[#f0f0f0]">
  <div
    class="absolute top-0 left-0 h-full max-w-full bg-[#FF0000] transition-all duration-[50ms] ease-in-out"
    style={`width: ${(peak / -MIN_DB) * 100}%`}
  ></div>

  <div
    class="absolute top-0 left-0 h-full max-w-full bg-[#00FF00] transition-all duration-[50ms] ease-in-out"
    style={`width: ${(rms / -MIN_DB) * 100}%`}
  ></div>
</div>
<div class="flex w-full justify-between">
  {#each loudnessSteps as db}
    <p>{db}</p>
  {/each}
</div>
