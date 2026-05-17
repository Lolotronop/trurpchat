<script lang="ts">
  import type { Snippet } from "svelte";
  import * as ContextMenu from "$lib/components/ui/context-menu";

  type Props = {
    children: Snippet;
    menu: Snippet;
  };

  let { children, menu }: Props = $props();
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger>{@render children()}</ContextMenu.Trigger>
  <ContextMenu.Content class="min-h-12 min-w-64 overflow-visible">
    {@render menu()}
  </ContextMenu.Content>
</ContextMenu.Root>
