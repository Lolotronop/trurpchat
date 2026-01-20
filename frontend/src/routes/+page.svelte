<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  import ServerSelector from "./servers/ServerSelector.svelte";
  import ServerUI from "./ServerUI.svelte";
  const g = gitGud();
  // TODO: this needs to be removed with proper
  // "speaking" sending
  g.mic.enableAnalyzer();
</script>

<main class="flex h-screen w-screen">
  <div class="flex h-full flex-col border-r p-2">
    <ServerSelector servers={g.servers} />
  </div>
  {#if g.servers.selected && g.servers.selected.connected}
    <ServerUI server={g.servers.selected} />
  {:else}
    <div class="flex h-full flex-col items-center justify-center">
      <p>Nope</p>
    </div>
  {/if}
</main>
