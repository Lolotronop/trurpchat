<script lang="ts">
  import type { Snippet } from "svelte";
  import LoudnessContextMenu from "$lib/components/LoudnessContextMenu.svelte";
  import * as ContextMenu from "$lib/components/ui/context-menu";

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
    <LoudnessContextMenu bind:gain bind:muted />
  </ContextMenu.Content>
</ContextMenu.Root>
