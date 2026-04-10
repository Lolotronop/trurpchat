<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Room } from "trurpchat-backend";
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
    room: Room;
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
  const unread = $derived(server.unread.find((u) => u.roomId === room.id));
  const unreadCount = $derived.by(() => {
    const unreadId = unread?.unreadId ?? 0;
    const diff = room.nextMessageId - unreadId;
    return diff;
  });

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
          server.gateway.send({
            type: "action.message.unread",
            roomId: room.id,
            unreadId: room.nextMessageId,
          });

          if (unread) {
            unread.unreadId = room.nextMessageId;
          } else {
            server.unread.push({
              roomId: room.id,
              unreadId: room.nextMessageId,
              userId: server.user.id,
            });
          }
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
