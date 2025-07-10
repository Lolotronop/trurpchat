<script lang="ts">
  import { Gateway } from "./gateway.svelte";
  import { LocalSourceManager } from "./localAudioManager.svelte";
  import Main from "./Main.svelte";

  async function setupContext() {
    const context = new AudioContext();
    await context.audioWorklet.addModule("noise-gate.js");
    await context.audioWorklet.addModule("loudness.js");
    const createGate = () => {
      const gate = new AudioWorkletNode(context, "noise-gate");
      return gate;
    };
    const createLoudnessMeter = () => {
      const meter = new AudioWorkletNode(context, "loudness");
      return meter;
    };
    return {
      context,
      createGate,
      createLoudnessMeter,
    };
  }
  const promise = setupContext().then(
    ({ context, createGate, createLoudnessMeter }) => {
      const localSourceManager = new LocalSourceManager(
        context,
        createGate,
        createLoudnessMeter,
      );
      localSourceManager.getPermissions();
      const gateway = new Gateway("ws://localhost:3000");
      return {
        localSourceManager,
        gateway,
        audioContext: context,
        createLoudnessMeter,
      };
    },
  );
</script>

{#await promise}
  <p>Loading...</p>
{:then props}
  <Main {...props} />
{/await}
