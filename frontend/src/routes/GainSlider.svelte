<script lang="ts">
  import { Slider } from "$lib/components/ui/slider";
  import { fromDb, toDb } from "$lib/utils.svelte";
  import { fly, scale } from "svelte/transition";
  import Ticks from "./Ticks.svelte";
  type Props = {
    value: number;
    min?: number;
    max?: number;
    toInfinite?: boolean;
    ticks?: boolean | number[];
  };

  let {
    value = $bindable(),
    min = -42,
    max = 18,
    toInfinite = true,
    ticks = true,
  }: Props = $props();

  const steps: number[] = [];
  if (!Array.isArray(ticks)) {
    if (ticks) {
      for (let i = -6; i >= min; i -= 6) {
        steps.push(i);
      }
      for (let i = 0; i <= max; i += 6) {
        steps.push(i);
      }
    }
  } else {
    steps.push(...ticks);
  }
  const pct = (raw: number) => {
    const v = toDb(raw);
    return ((v - min) / (max - min)) * 100;
  };

  let hovering = $state(false);
  let active = $state(false);
  let intervalId: NodeJS.Timeout | null = null;
  function setActive() {
    active = true;
    if (intervalId) {
      clearInterval(intervalId);
    }
    intervalId = setInterval(() => {
      active = false;
    }, 300);
  }
</script>

{#snippet slider()}
  <div>
    {#if hovering || active}
      {@const db = toDb(value)}
      <div
        class="bg-muted absolute top-[-36px] flex w-28 -translate-x-1/2 justify-center gap-1 rounded text-center select-none"
        style="left: {pct(value)}%"
        transition:fly={{ duration: 200, y: 10 }}
      >
        <!-- left side: text-right + small right padding, no margin -->
        <span class="w-full text-right">
          {Number.isFinite(db) ? db.toFixed(0) : "-∞"} db
        </span>

        <span class="pointer-events-none"> | </span>

        <span class="w-full text-left">
          {(value * 100).toFixed(0)}%
        </span>
      </div>
    {/if}

    <Slider
      type="single"
      class="w-full"
      step={0.1}
      {min}
      {max}
      ondblclick={() => {
        value = 1;
      }}
      onmouseenter={() => {
        hovering = true;
      }}
      onmouseleave={() => {
        hovering = false;
      }}
      bind:value={
        () => (value == 0 ? min : toDb(value)),
        (v) => {
          setActive();
          if (v === min && toInfinite) {
            value = 0;
          } else {
            value = fromDb(v);
          }
        }
      }
    />
  </div>
{/snippet}

{#if steps.length > 0}
  <Ticks {max} {min} ticks={steps}>
    {@render slider()}
  </Ticks>
{:else}
  {@render slider()}
{/if}
