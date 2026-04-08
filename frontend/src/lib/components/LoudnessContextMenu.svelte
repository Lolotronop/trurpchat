<script lang="ts">
  import GainSlider from "$lib/components/GainSlider.svelte";
  import { Item } from "$lib/components/ui/context-menu";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { toDb } from "$lib/utils.svelte";

  type Props = {
    gain: number;
    muted: boolean;
  };

  let { gain = $bindable(), muted = $bindable() }: Props = $props();
</script>

<Item
  class="flex w-full flex-row justify-between"
  onclick={(e) => {
    e.preventDefault();
    muted = !muted;
  }}
>
  <p>Замутить</p>
  <Checkbox checked={muted} />
</Item>

<Item onclick={(e) => e.preventDefault()} class="flex flex-col pb-4">
  <div
    class="flex flex-row items-center justify-between gap-2 text-sm font-normal w-full"
  >
    <p>Громкость</p>
    <span>
      <input
        class="w-[6ch] text-right p-1"
        type="text"
        bind:value={() => {return (gain * 100).toFixed(0)},
      (g) => {gain = Number(g) / 100}}
      >
      %
    </span>
  </div>
  <GainSlider class="w-full" bind:value={gain} max={toDb(3)} ticks={[0]} />
</Item>
