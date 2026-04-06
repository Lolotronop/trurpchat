<script lang="ts">
  import type { Snippet } from "svelte";
  import GainSlider from "$lib/components/GainSlider.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import { toDb } from "$lib/utils.svelte";

  type Props = {
    children: Snippet;
    gain: number;
    muted: boolean;
  };

  let {
    children,
    gain = $bindable(),
    muted = $bindable(),
  }: Props = $props();
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger>{@render children()}</ContextMenu.Trigger>
  <ContextMenu.Content class="min-h-12 min-w-64 overflow-visible">
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
  </ContextMenu.Content>
</ContextMenu.Root>
