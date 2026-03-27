<script lang="ts">
  import { fly } from "svelte/transition";
  import { Slider } from "$lib/components/ui/slider";

  type Props = {
    value: number;
    min?: number;
    max?: number;
    toInfinite?: boolean;
    ticks?: boolean | number[];
    class?: string;
  };

  let { value = $bindable(), max = 10, class: className }: Props = $props();

  const SLIDER_MIN = 0;
  const SLIDER_MAX = 100;
  const SLIDER_MID = 50;
  const FLOOR_DB = -36;
  const floorGain = dbToGain(FLOOR_DB);

  function dbToGain(db: number) {
    return db === -Infinity ? 0 : 10 ** (db / 20);
  }

  function gainToDb(gain: number) {
    return gain === 0 ? -Infinity : 20 * Math.log10(gain);
  }

  function clamp(value: number, low: number, high: number) {
    return Math.min(high, Math.max(low, value));
  }

  function sliderToGain(position: number) {
    const clamped = clamp(position, SLIDER_MIN, SLIDER_MAX);

    if (clamped <= SLIDER_MID) {
      const unit = clamped / SLIDER_MID;
      const curved = dbToGain(FLOOR_DB * (1 - unit));
      return (curved - floorGain) / (1 - floorGain);
    }

    const unit = (clamped - SLIDER_MID) / SLIDER_MID;
    return dbToGain(max * unit);
  }

  function gainToSlider(gain: number) {
    const clamped = Math.max(0, gain);

    if (clamped <= 1) {
      const normalized = floorGain + clamped * (1 - floorGain);
      const unit = 1 - gainToDb(normalized) / FLOOR_DB;
      return clamp(unit * SLIDER_MID, SLIDER_MIN, SLIDER_MID);
    }

    if (max <= 0) {
      return SLIDER_MAX;
    }

    const unit = clamp(gainToDb(clamped) / max, 0, 1);
    return SLIDER_MID + unit * SLIDER_MID;
  }

  let hovering = $state(false);
  let active = $state(false);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function setActive() {
    active = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      active = false;
    }, 300);
  }
</script>

{#snippet slider()}
  <div class="relative {className}">
    {#if hovering || active}
      {@const db = gainToDb(value)}
      <div
        class="bg-muted absolute -top-9 flex w-28 -translate-x-1/2 justify-center gap-1 rounded text-center select-none"
        style="left: {gainToSlider(value)}%"
        transition:fly={{ duration: 200, y: 10 }}
      >
        <span class="w-full text-right">
          {Number.isFinite(db) ? db.toFixed(0) : "-∞"}
          db
        </span>

        <span class="pointer-events-none"> | </span>

        <span class="w-full text-left"> {(value * 100).toFixed(0)}% </span>
      </div>
    {/if}

    <Slider
      type="single"
      class="w-full"
      step={0.1}
      min={SLIDER_MIN}
      max={SLIDER_MAX}
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
        () => gainToSlider(value),
        (v) => {
          setActive();
          value = sliderToGain(v);
        }
      }
    />
  </div>
{/snippet}

{@render slider()}
