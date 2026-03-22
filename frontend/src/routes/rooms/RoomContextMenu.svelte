<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Room } from "trurpchat-backend";
  import * as ContextMenu from "$lib/components/ui/context-menu";
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

<ContextMenu.Root>
  <ContextMenu.Trigger>{@render children()}</ContextMenu.Trigger>
  <ContextMenu.Content class="min-h-12 min-w-64 overflow-visible">
    {#if server.user.permissions === 1}
      <ContextMenu.Item onclick={() => editOpen = true}
        >Изменить</ContextMenu.Item
      >
      <ContextMenu.Item variant="destructive" onclick={onRoomDelete}>
        Удалить
      </ContextMenu.Item>
    {:else}
      <p>:(</p>
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>
