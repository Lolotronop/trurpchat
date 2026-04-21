<script lang="ts">
  import type { Snippet } from "svelte";
  import type { RoomWithData } from "$lib/rooms.svelte";
  import {
    Root,
    Item,
    Content,
    Trigger,
  } from "$lib/components/ui/context-menu";
  import * as Dialog from "$lib/components/ui/dialog";
  import type { Server } from "$lib/servers.svelte";
  import RoomForm, { type EditingRoom } from "./RoomForm.svelte";

  type Props = {
    server: Server;
    room: RoomWithData;
    children: Snippet;
  };

  const { server, children, room }: Props = $props();

  let editOpen = $state(false);
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
  const hasUnread = $derived(unreadCount > 0);
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

<Root>
  <Trigger>{@render children()}</Trigger>
  <Content class="min-h-12 min-w-64 overflow-visible">
    {#if isText && hasUnread}
      <Item
        onclick={() => {
          server.unread.set(room.id, room.nextMessageId);
        }}
      >
        Отметить как прочитанное
      </Item>
    {/if}

    {#if server.user.permissions === 1}
      <Item onclick={() => editOpen = true}> Изменить </Item>
      <Item variant="destructive" onclick={onRoomDelete}> Удалить </Item>
    {/if}
  </Content>
</Root>
