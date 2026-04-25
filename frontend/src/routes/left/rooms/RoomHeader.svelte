<script lang="ts">
  import { Hash, Volume2 } from "@lucide/svelte";
  import type { RoomWithData } from "$lib/rooms.svelte";

  type Props = {
    room: RoomWithData;
    selected: boolean;
    unread?: number;
    mentions?: number;
  };

  const { room, selected, unread, mentions }: Props = $props();

  function getRoomColor() {
    if (room.notificationMode !== "muted") {
      return room.colorHex;
    }

    if (!room.colorHex) {
      return undefined;
    }

    return `color-mix(in srgb, ${room.colorHex} 45%, var(--muted-foreground) 55%)`;
  }

  const showsUnreadIndicators = $derived(room.notificationMode !== "muted");

  const unreadCount = $derived(
    room.nextMessageId - (unread ?? room.nextMessageId),
  );
  const hasUnread = $derived(showsUnreadIndicators && unreadCount > 0);
  const hasMentions = $derived(showsUnreadIndicators && (mentions ?? 0) > 0);
</script>

<div
  class={[
      "group hover:bg-accent/20 rounded-md flex w-full flex-row items-center justify-between text-base font-normal px-3 py-1.5",
      hasUnread && "text-foreground",
      selected && "bg-accent/20"
    ]}
>
  <div
    class={[
      "flex flex-row items-center gap-2 room-name group-hover:brightness-150",
      room.notificationMode === "muted" && "brightness-75 hover:brightness-80!",
      selected && "brightness-150"
    ]}
    style={`color: ${getRoomColor()}`}
  >
    {#if room.type === "text"}
      <Hash size={16} strokeWidth={3} />
    {:else if room.type === "voice"}
      <Volume2 size={16} strokeWidth={3} />
    {:else}
      UNKNOWN
    {/if}
    <p>{room.name}</p>
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
</div>
