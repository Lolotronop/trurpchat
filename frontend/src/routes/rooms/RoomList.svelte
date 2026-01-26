<script lang="ts">
  import type { Server } from "$lib/servers.svelte";
  import VoiceRoom from "./VoiceRoom.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  const rtc = $derived(server.rtc);
</script>

<div class="h-full p-2">
  {#each server?.rooms || [] as room (room.name)}
    {#if room.type === "voice"}
      <VoiceRoom {room} server={server!} {rtc} />
    {/if}
  {/each}
</div>
