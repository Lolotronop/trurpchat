<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";

  type Props = {
    children: Snippet;
    speaking?: boolean;
    rounded?: boolean;
    class?: string;
  };

  let {
    children,
    speaking = false,
    rounded = false,
    class: className,
  }: Props = $props();
</script>

<div class={cn("relative", className)}>
  {@render children()}

  {#if speaking}
    <div
      aria-hidden="true"
      class={cn(
        "pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_0_2px_rgb(34_197_94),inset_0_0_0_3px_rgb(0_0_0)]",
        rounded && "rounded-[inherit]"
      )}
    ></div>
  {/if}
</div>
