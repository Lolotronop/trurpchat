<script lang="ts">
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import LoudnessContextMenu from "$lib/components/LoudnessContextMenu.svelte";
  import { gitGud } from "$lib/god.svelte";
  import type { VoiceRoom } from "$lib/rooms.svelte";
  import type { Server } from "$lib/servers.svelte";
  import type { WebRTC } from "$lib/webrtc.svelte";
  import VoiceUser from "./VoiceUser.svelte";

  const g = gitGud();

  type Props = {
    rtc: WebRTC;
    room: VoiceRoom;
    server: Server;
  };

  const { rtc, room, server }: Props = $props();
</script>

<div class="flex flex-col pl-8">
  {#each room.users as userId (userId)}
    {@const user = server.users.find(userId)}
    {#if user?.online}
      {@const peer = rtc?.peers.get(user.id)}
      {#if user.id === server?.user.id}
        <ContextMenu>
          {#snippet menu()}
            <LoudnessContextMenu
              bind:gain={g.mic.gain}
              bind:muted={g.mic.muted}
            />
          {/snippet}
          <VoiceUser
            {user}
            mutedByMe={false}
            speaking={g.mic.speaking && !g.muted}
          />
        </ContextMenu>
      {:else}
        {#if peer}
          <ContextMenu>
            {#snippet menu()}
              <LoudnessContextMenu
                bind:gain={peer.volume}
                bind:muted={peer.mute}
              />
            {/snippet}

            <VoiceUser
              {user}
              mutedByMe={peer?.mute ?? false}
              speaking={peer?.speaking ?? false}
            />
          </ContextMenu>
        {:else}
          <VoiceUser {user} mutedByMe={false} speaking={false} />
        {/if}
      {/if}
    {/if}
  {/each}
</div>
