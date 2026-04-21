<script lang="ts">
  import { Hash } from "@lucide/svelte";
  import type { TextRoom } from "$lib/rooms.svelte";
  import { Button } from "$lib/components/ui/button";
  import type { Server } from "$lib/servers.svelte";
  import RoomContextMenu from "./RoomContextMenu.svelte";

  type Props = {
    room: TextRoom;
    server: Server;
    selected: boolean;
  };

  const { room, server, selected }: Props = $props();

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

  const unread = $derived(server.unread.get(room.id));
  const mentions = $derived(server.unread.getMentions(room.id));
  const unreadCount = $derived(room.nextMessageId - unread);
  const hasUnread = $derived(unreadCount > 0);
  const hasMentions = $derived(mentions > 0);
</script>

<RoomContextMenu {room} {server}>
  <Button
    variant="ghost"
    class="group hover:text-foreground! flex w-full flex-row items-center justify-between text-base font-normal {hasUnread ? "text-foreground" : ""} {selected ? "bg-accent/20" : ""}"
  >
    <div class="flex flex-row items-center gap-2">
      <Hash
        size={16}
        strokeWidth={3}
        class="room-name transition-colors"
        class:text-muted-foreground={room.notificationMode === "muted" && !room.colorHex}
        style:--room-color={getRoomColor()}
        style:--hover-room-color={getHoverRoomColor()}
      />
      <p
        class="room-name transition-colors"
        class:text-muted-foreground={room.notificationMode === "muted" && !room.colorHex}
        style:--room-color={getRoomColor()}
        style:--hover-room-color={getHoverRoomColor()}
      >{room.name}</p>
    </div>
    <div class="flex flex-row items-center gap-1">
    {#if hasUnread}
      <div
        class="flex flex-row items-center justify-center gap-2 rounded-xl bg-accent px-1 py-0.5 text-accent-foreground text-sm min-w-6"
      >
        <p>{unreadCount}</p>
      </div>
    {/if}
    {#if hasMentions}
      <div
        class="flex flex-row items-center justify-center gap-2 rounded-xl bg-destructive px-1 py-0.5 text-sm min-w-6"
      >
        <p>{mentions}</p>
      </div>
    {/if}
    </div>
  </Button>
</RoomContextMenu>

<style>
  .room-name {
    color: var(--room-color, inherit);
  }

  .group:hover .room-name {
    color: var(--hover-room-color, inherit);
  }
</style>
