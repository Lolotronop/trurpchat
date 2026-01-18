<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  import VoiceRoom from "./VoiceRoom.svelte";
  const g = gitGud();
  // TODO: this needs to be removed with proper
  // "speaking" sending
  g.mic.enableAnalyzer();

  const rtc = $derived(g.servers.selected?.rtc);
  const server = $derived(g.servers.selected);
</script>

<div class="h-full w-full p-2">
  {#each server?.rooms || [] as room (room.name)}
    {#if room.type === "voice"}
      <VoiceRoom {room} server={server!} {rtc} />
    {/if}
  {/each}
</div>
