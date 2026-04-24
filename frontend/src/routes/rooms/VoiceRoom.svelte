<script lang="ts">
  import { Volume2 } from "@lucide/svelte";
  import type { VoiceRoom } from "$lib/rooms.svelte";
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
    room: VoiceRoom;
    server: Server;
    selected: boolean;
  };

  const { rtc, room, server, selected }: Props = $props();

  function getRoomColor() {
    if (room.notificationMode !== "muted") {
      return room.colorHex;
    }

    if (!room.colorHex) {
      return undefined;
    }

    return `color-mix(in srgb, ${room.colorHex} 45%, var(--muted-foreground) 55%)`;
  }

  function getHoverRoomColor() {
    if (room.notificationMode !== "muted") {
      return room.colorHex;
    }

    return room.colorHex ?? "var(--foreground)";
  }
</script>

<RoomContextMenu {room} {server}>
  <Button
    variant="ghost"
    class="group hover:text-foreground flex gaps-2 w-full flex-row items-center justify-start text-base font-normal {rtc
      ?.room?.id === room.id
      ? ''
      : 'text-muted-foreground'}
    {selected ? 'bg-accent/20' : ''}
    "
    onclick={() => server?.joinRoom(room)}
  >
    <div
      class="flex flex-row items-center gap-2 room-name"
      style={`--room-color: ${getRoomColor()}; --hover-room-color: ${getHoverRoomColor()}`}
    >
      <Volume2 size={16} strokeWidth={3} />
      <p>{room.name}</p>
    </div>
  </Button>
</RoomContextMenu>

<!-- svelte-ignore css_unused_selector -->
<style>
  .room-name {
    color: var(--room-color, inherit);
  }

  .group:hover .room-name {
    color: var(--hover-room-color, inherit);
  }
</style>

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
