<script lang="ts">
  import { Volume2 } from "@lucide/svelte";
  import type { VoiceChat } from "trurpchat-backend";
  import { Button } from "$lib/components/ui/button";
  import { gitGud } from "$lib/god.svelte";
  import type { Server } from "$lib/servers.svelte";
  import type { WebRTC } from "$lib/webrtc.svelte";
  import RoomContextMenu from "./RoomContextMenu.svelte";
  import VoiceUser from "./VoiceUser.svelte";
  import LoudnessContextMenu from "$lib/components/LoudnessContextMenu.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";

  const g = gitGud();

  type Props = {
    rtc: WebRTC;
    room: VoiceChat;
    server: Server;
  };

  const { rtc, room, server }: Props = $props();
</script>

<RoomContextMenu {room} {server}>
  <Button
    variant="ghost"
    class="hover:text-foreground! flex w-full flex-row items-center justify-start text-base font-normal {rtc
      ?.room?.id === room.id
      ? ''
      : 'text-muted-foreground'}"
    onclick={() => server?.joinRoom(room)}
  >
    <div class="flex flex-row items-center gap-2">
      <Volume2 size={16} strokeWidth={3} />
      <p>{room.name}</p>
    </div>
  </Button>
</RoomContextMenu>
<div class="flex flex-col pl-8">
  {#each room.users as userId (userId)}
    {@const user = server.findUser(userId)}
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
            {rtc}
            {room}
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
              {rtc}
              {room}
              mutedByMe={peer?.mute ?? false}
              speaking={peer?.speaking ?? false}
            />
          </ContextMenu>
        {:else}
          <VoiceUser {user} {rtc} {room} mutedByMe={false} speaking={false} />
        {/if}
      {/if}
    {/if}
  {/each}
</div>
