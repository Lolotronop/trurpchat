<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  import Main from "./Main.svelte";

  const context = new AudioContext();
  const p = Promise.all([
    context.audioWorklet.addModule("noise-gate.js"),
    context.audioWorklet.addModule("loudness.js"),
  ]);

  const loaded = p.then(() => {
    gitGud(context);
  });
</script>

{#await loaded}
  Loading plugins...
{:then _}
  <Main />
{/await}
