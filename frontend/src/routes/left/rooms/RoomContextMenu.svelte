<script lang="ts">
  import type { Snippet } from "svelte";
  import { Permission } from "trurpchat-shared";
  import type { RoomWithData } from "$lib/rooms.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import Item from "$lib/components/ContextMenuItem.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import type { Server } from "$lib/servers.svelte";
  import { CheckCheck, Pencil, Settings, Trash } from "@lucide/svelte";
  import RoomForm, { type EditingRoom } from "./RoomForm.svelte";
  import RoomSettings from "./RoomSettings.svelte";

  type Props = {
    server: Server;
    room: RoomWithData;
    children: Snippet;
  };

  const { server, children, room }: Props = $props();

  let editOpen = $state(false);
  let settingsOpen = $state(false);
  function onRoomSubmit(newRoom: EditingRoom) {
    server.gateway.send({
      type: "action.room.update",
      room: {
        id: room.id,
        ...newRoom,
      },
    });
    editOpen = false;
  }

  function onRoomDelete() {
    server.gateway.send({
      type: "action.room.delete",
      id: room.id,
    });
  }

  const isText = $derived(room.type === "text");
  const unread = $derived(server.unread.get(room.id));
  const unreadCount = $derived(room.nextMessageId - unread);
  const hasUnread = $derived(
    room.notificationMode !== "muted" && unreadCount > 0,
  );
</script>

<Dialog.Root bind:open={editOpen}>
  <Dialog.Content class="max-w-2xl">
    <RoomForm
      initial={room}
      onsubmit={onRoomSubmit}
      oncalcel={() => {editOpen = false}}
    />
  </Dialog.Content>
</Dialog.Root>

<RoomSettings bind:open={settingsOpen} {server} {room} />

<ContextMenu>
  {#snippet menu()}
    {#if isText}
      <Item
        disabled={!hasUnread}
        onclick={() => {
          server.unread.set(room.id, room.nextMessageId);
        }}
      >
        Отметить как прочитанное
        <CheckCheck />
      </Item>
    {/if}

    <Item onclick={() => (settingsOpen = true)}>
      Настройки
      <Settings />
    </Item>

    {#if server.can(Permission.MANAGE_ROOMS)}
      <Item onclick={() => editOpen = true}>
        Изменить
        <Pencil />
      </Item>
      <Item variant="destructive" onclick={onRoomDelete}>
        Удалить
        <Trash />
      </Item>
    {/if}
  {/snippet}

  {@render children()}
</ContextMenu>
