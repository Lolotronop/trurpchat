<script lang="ts">
  import GainSlider from "$lib/components/GainSlider.svelte";
  import Item from "$lib/components/ContextMenuItem.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { toDb } from "$lib/utils.svelte";
  import { Volume2, VolumeX } from "@lucide/svelte";

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
  <div class="flex flex-row items-center gap-2">
    <p>Замутить</p>
  </div>
  <Checkbox checked={muted} />
</Item>

<div
  data-slot="context-menu-item"
  class="relative flex cursor-default select-none flex-col gap-2 rounded-sm px-2 py-1.5 pb-4 text-sm outline-hidden hover:bg-accent/20"
>
  <div
    class="flex flex-row items-center justify-between gap-2 text-sm font-normal w-full"
  >
    <div class="flex flex-row items-center gap-2">
      <p>Громкость</p>
    </div>
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
</div>
