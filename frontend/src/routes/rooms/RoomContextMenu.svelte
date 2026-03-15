<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Server } from "$lib/servers.svelte";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as Dialog from "$lib/components/ui/dialog";
  import RoomForm from "./RoomForm.svelte";
  import type { Room, RoomData } from "trurpchat-backend";

  type Props = {
    server: Server;
    room: Room;
    children: Snippet;
  };

  const { server, children, room }: Props = $props();

  let editOpen = $state(false);
  function onRoomSubmit(newRoom: Omit<RoomData, "id" | "order">) {
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

<ContextMenu.Root>
  <ContextMenu.Trigger>{@render children()}</ContextMenu.Trigger>
  <ContextMenu.Content class="min-h-12 min-w-64 overflow-visible">
    {#if server.user.permissions === 1}
      <Dialog.Root bind:open={editOpen}>
        <Dialog.Trigger class="w-full">
          <ContextMenu.Item>Изменить</ContextMenu.Item>
        </Dialog.Trigger>
        <Dialog.Content class="max-w-2xl">
          <RoomForm
            initial={room}
            onsubmit={onRoomSubmit}
            oncalcel={() => {editOpen = false}}
          />
        </Dialog.Content>
      </Dialog.Root>
      <ContextMenu.Item variant="destructive" onclick={onRoomDelete}>
        Удалить
      </ContextMenu.Item>
    {:else}
      <p>:(</p>
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>
