<script lang="ts">
  import { Volume2 } from "@lucide/svelte";
  import type { VoiceChat } from "trurpchat-backend";
  import { Button } from "$lib/components/ui/button";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { toDb } from "$lib/utils.svelte";
  import { gitGud } from "$lib/god.svelte";
  import GainSlider from "$lib/components/GainSlider.svelte";
  import type { WebRTC } from "$lib/webrtc.svelte";
  import type { Server } from "$lib/servers.svelte";
  import VoiceUser from "./VoiceUser.svelte";
  import RoomContextMenu from "./RoomContextMenu.svelte";

  const g = gitGud();
  // TODO: this needs to be removed with proper
  // "speaking" sending
  g.mic.enableAnalyzer();

  type Props = {
    rtc: WebRTC | undefined;
    room: VoiceChat;
    server: Server;
  };

  const { rtc, room, server }: Props = $props();
</script>

<RoomContextMenu room={room} server={server}>
  <Button
    variant="ghost"
    class="hover:text-foreground! flex w-full flex-row items-center justify-start text-base font-normal {rtc
      ?.room?.name === room.name
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
  {#each room.users as user (user.id)}
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
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          <VoiceUser
            {user}
            {rtc}
            {room}
            mutedByMe={peer?.mute ?? false}
            speaking={peer?.speaking ?? false}
          />
        </ContextMenu.Trigger>
        <ContextMenu.Content class="min-h-12 min-w-64 overflow-visible">
          {#if peer}
            <Button
              variant="ghost"
              class="flex w-full flex-row justify-between"
              onclick={() => {
                  peer.mute = !peer.mute;
                }}
            >
              <p>Замутить</p>
              <Checkbox checked={peer.mute} />
            </Button>

            <div class="w-full px-2">
              <p class="pl-2 text-sm font-normal">Громкость</p>
              <GainSlider
                bind:value={peer.volume}
                min={-32}
                max={toDb(2)}
                ticks={[0]}
              />
            </div>
          {:else}
            <p>:(</p>
          {/if}
        </ContextMenu.Content>
      </ContextMenu.Root>
    {/if}
  {/each}
</div>
