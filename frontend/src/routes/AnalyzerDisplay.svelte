<script lang="ts">
  import Ticks from "./Ticks.svelte";

  type Props = {
    rms: number;
    peak: number;
  };
  const { rms, peak }: Props = $props();

  const MIN = -42;
  const ticks: number[] = [];
  for (let i = 0; i >= MIN; i -= 6) {
    ticks.push(i);
  }
</script>

<Ticks {ticks} height={18}>
  <div class="bg-muted relative h-[20px] w-full">
    <div
      class="absolute top-0 left-0 h-full max-w-full bg-red-500"
      style={`width: ${(1 - peak / MIN) * 100}%`}
    ></div>

    <div
      class="absolute top-0 left-0 h-full max-w-full bg-green-600"
      style={`width: ${(1 - rms / MIN) * 100}%`}
    ></div>
  </div>
</Ticks>
