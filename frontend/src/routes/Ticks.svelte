<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    ticks: number[];
    min?: number;
    max?: number;
    children: Snippet;
    height?: number;
  };
  let {
    ticks: t,
    children,
    min: initialMin,
    max: initialMax,
    height,
  }: Props = $props();
  height ??= 4;

  const ticks = $derived(t.toSorted((a, b) => a - b));
  let min = $derived(initialMin ?? ticks[0]);
  let max = $derived(initialMax ?? ticks[ticks.length - 1]);

  function pct(t: number) {
    return ((t - min) / (max - min)) * 100 + "%";
  }
</script>

<div class="relative w-full" style="padding-bottom: {height}px">
  <div class="pointer-events-none absolute inset-0 z-10 select-none">
    {#each ticks as t}
      <div
        class="absolute flex -translate-x-1/2 flex-col items-center"
        style="left: {pct(t)};"
      >
        <div
          class="bg-secondary h-full w-0.5"
          style="height: {height}px;"
        ></div>
        <div class="text-s text-muted-foreground">
          {t > 0 ? "+" : ""}
          {t}
        </div>
      </div>
    {/each}
  </div>
  {@render children()}
</div>
