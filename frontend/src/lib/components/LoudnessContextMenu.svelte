<script lang="ts">
  import GainSlider from "$lib/components/GainSlider.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { toDb } from "$lib/utils.svelte";

  type Props = {
    gain: number;
    muted: boolean;
  };

  let {
    gain = $bindable(),
    muted = $bindable(),
  }: Props = $props();
</script>

<Button
  variant="ghost"
  class="flex w-full flex-row justify-between"
  onclick={() => {
    muted = !muted;
  }}
>
  <p>Замутить</p>
  <Checkbox checked={muted} />
</Button>

<div class="flex w-full flex-col gap-2 p-2 px-4">
  <div class="flex flex-row items-center justify-between gap-2 text-sm font-normal">
    <p>Громкость</p>
    <p>{(gain * 100).toFixed(0)}%</p>
  </div>
  <GainSlider bind:value={gain} max={toDb(3)} ticks={[0]} />
</div>
