<script lang="ts">
  import { fromDb, toDb } from "$lib/utils.svelte";
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
</script>

{#snippet slider()}
  <input
    class="w-full"
    type="range"
    {min}
    {max}
    step="0.01"
    ondblclick={() => {
      value = 1;
    }}
    bind:value={
      () => (value == 0 ? min : toDb(value)),
      (v) => {
        if (v === min && toInfinite) {
          value = 0;
        } else {
          value = fromDb(v);
        }
      }
    }
  />
{/snippet}

{#if steps.length > 0}
  <Ticks {max} {min} ticks={steps}>
    {@render slider()}
  </Ticks>
{:else}
  {@render slider()}
{/if}
