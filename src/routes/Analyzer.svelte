<script lang="ts">
  import AnalyzerDisplay from "./AnalyzerDisplay.svelte";
  import {
    fromDb,
    MIN_DB,
    toDb,
    type LocalSourceManager,
  } from "./localAudioManager.svelte";

  const {
    localMediaManager,
  }: {
    localMediaManager: LocalSourceManager;
  } = $props();

  const loudnessSteps: number[] = [];
  for (let i = MIN_DB; i <= 0; i += 10) {
    loudnessSteps.push(i);
  }

  $effect(() => {
    localMediaManager.enableMic();
    localMediaManager.enableAnalyzer();
    return () => {
      localMediaManager.disableAnalyzer();
    };
  });
</script>

<div class="flex w-[800px] flex-col">
  <div>
    <input
      type="range"
      class="w-full"
      min="-60"
      max="16"
      step="0.1"
      bind:value={
        () => {
          const db = toDb(localMediaManager.controls.inputGain);
          return db;
        },
        (v) => {
          localMediaManager.setGain(fromDb(v));
        }
      }
    />
  </div>
  <AnalyzerDisplay
    rms={localMediaManager.loudnessLevel}
    peak={localMediaManager.loudnessPeakLevel}
  />
</div>
