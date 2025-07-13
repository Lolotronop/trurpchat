<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    ticks: number[];
    min?: number;
    max?: number;
    children: Snippet;
  };
  let { ticks: t, children, min, max }: Props = $props();
  const ticks = t.toSorted((a, b) => a - b);
  min ??= ticks[0];
  max ??= ticks[ticks.length - 1];
  const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;
</script>

<div class="relative w-full">
  <div class="pointer-events-none absolute inset-0 z-10">
    {#each ticks as t}
      <div
        class="absolute flex -translate-x-1/2 flex-col items-center"
        style="left: {pct(t)};"
      >
        <div class="h-3 w-[2px] bg-slate-300"></div>
        <div class="text-s mt-1 text-slate-300">{t > 0 ? "+" : ""}{t}</div>
      </div>
    {/each}
  </div>
  {@render children()}
</div>
