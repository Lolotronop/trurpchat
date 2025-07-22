<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    ticks: number[];
    min?: number;
    max?: number;
    children: Snippet;
    height?: number;
  };
  let { ticks: t, children, min, max, height }: Props = $props();
  height ??= 4;
  const ticks = t.toSorted((a, b) => a - b);
  min ??= ticks[0];
  max ??= ticks[ticks.length - 1];
  const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;
</script>

<div class="relative w-full" style="padding-bottom: {height}px">
  <div class="pointer-events-none absolute inset-0 z-10 select-none">
    {#each ticks as t}
      <div
        class="absolute flex -translate-x-1/2 flex-col items-center"
        style="left: {pct(t)};"
      >
        <div
          class="bg-secondary h-full w-[2px]"
          style="height: {height}px;"
        ></div>
        <div class="text-s text-muted-foreground">
          {t > 0 ? "+" : ""}{t}
        </div>
      </div>
    {/each}
  </div>
  {@render children()}
</div>
