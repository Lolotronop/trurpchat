<script lang="ts">
  import Ticks from "./Ticks.svelte";

  type Props = {
    rms: number;
    peak: number;
    min: number;
  };
  const { rms, peak, min }: Props = $props();

  const ticks = $derived.by(() => {
    const ticks: number[] = [];
    for (let i = 0; i >= min; i -= 6) {
      ticks.push(i);
    }
    return ticks;
  });
</script>

<Ticks {ticks} height={18}>
  <div class="bg-muted relative h-5 w-full">
    <div
      class="absolute top-0 left-0 h-full max-w-full bg-red-500"
      style={`width: ${(1 - peak / min) * 100}%`}
    ></div>

    <div
      class="absolute top-0 left-0 h-full max-w-full bg-green-600"
      style={`width: ${(1 - rms / min) * 100}%`}
    ></div>
  </div>
</Ticks>
