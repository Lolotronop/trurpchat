<script lang="ts">
  import { Volume2 } from "@lucide/svelte";
  import type { VoiceChat } from "trurpchat-backend";
  import LoudnessContext from "$lib/components/LoudnessContext.svelte";
  import { Button } from "$lib/components/ui/button";
  import { gitGud } from "$lib/god.svelte";
  import type { Server } from "$lib/servers.svelte";
  import type { WebRTC } from "$lib/webrtc.svelte";
  import RoomContextMenu from "./RoomContextMenu.svelte";
  import VoiceUser from "./VoiceUser.svelte";

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
        <VoiceUser
          {user}
          {rtc}
          {room}
          mutedByMe={false}
          speaking={g.mic.speaking && !g.muted}
        />
      {:else}
        {#if peer}
          <LoudnessContext bind:gain={peer.volume} bind:muted={peer.mute}>
            <VoiceUser
              {user}
              {rtc}
              {room}
              mutedByMe={peer?.mute ?? false}
              speaking={peer?.speaking ?? false}
            />
          </LoudnessContext>
        {:else}
          <VoiceUser
            {user}
            {rtc}
            {room}
            mutedByMe={false}
            speaking={false}
          />
        {/if}
      {/if}
    {/if}
  {/each}
</div>
