<script lang="ts">
  import { Volume2 } from "@lucide/svelte";
  import type { VoiceChat } from "trurpchat-backend";
  import GainSlider from "$lib/components/GainSlider.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import { gitGud } from "$lib/god.svelte";
  import type { Server } from "$lib/servers.svelte";
  import { toDb } from "$lib/utils.svelte";
  import type { WebRTC } from "$lib/webrtc.svelte";
  import RoomContextMenu from "./RoomContextMenu.svelte";
  import VoiceUser from "./VoiceUser.svelte";

  const g = gitGud();

  type Props = {
    rtc: WebRTC | undefined;
    room: VoiceChat;
    server: Server;
  };

  const { rtc, room, server }: Props = $props();
</script>

<RoomContextMenu {room} {server}>
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

              <div class="flex flex-col gap-2 w-full p-2 px-4">
                <div
                  class="flex flex-row items-center justify-between gap-2 text-sm font-normal"
                >
                  <p>Громкость</p>
                  <p>{(peer.volume * 100).toFixed(0)}%</p>
                </div>
                <GainSlider
                  bind:value={peer.volume}
                  max={toDb(3)}
                  ticks={[0]}
                />
              </div>
            {:else}
              <p>:(</p>
            {/if}
          </ContextMenu.Content>
        </ContextMenu.Root>
      {/if}
    {/if}
  {/each}
</div>
