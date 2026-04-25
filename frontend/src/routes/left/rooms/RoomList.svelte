<script lang="ts">
  import { PlusIcon } from "@lucide/svelte";
  import { tick } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import type { Server } from "$lib/servers.svelte";
  import type { EditingRoom } from "./RoomForm.svelte";
  import RoomForm from "./RoomForm.svelte";
  import RoomHeader from "./RoomHeader.svelte";
  import RoomContextMenu from "./RoomContextMenu.svelte";
  import VoiceRoomUsers from "./VoiceRoomUsers.svelte";

  type Props = {
    server: Server;
    selectedRoomId: number | undefined;
  };
  let { server, selectedRoomId = $bindable(undefined) }: Props = $props();

  const rtc = $derived(server.rtc);

  let editOpen = $state(false);
  function onRoomSubmit(room: EditingRoom) {
    server.gateway.send({
      type: "action.room.create",
      room,
    });
    editOpen = false;
  }

  // TODO: this is a hack to make the cache derive work
  // in the ServerUI. Fix this somehow.
  async function setRoomId(roomId: number) {
    if (selectedRoomId === roomId) return;
    selectedRoomId = undefined;
    await tick();
    selectedRoomId = roomId;
  }
</script>

<div class="h-full p-2 flex flex-col gap-0.5">
  {#each server.rooms.list as room (room.id)}
    {#if room.type === "voice"}
      <RoomContextMenu {room} {server}>
        <button
          type="button"
          class="contents"
          onclick={() => {
        setRoomId(room.id)
        server.joinRoom(room)
      }}
        >
          <RoomHeader {room} selected={selectedRoomId === room.id} />
        </button>
      </RoomContextMenu>
      <VoiceRoomUsers {room} {server} {rtc} />
    {/if}
    {#if room.type === "text"}
      <RoomContextMenu {room} {server}>
        <button
          type="button"
          class="contents {(selectedRoomId !== room.id) && 'text-muted-foreground'}"
          onclick={() => setRoomId(room.id)}
        >
          <RoomHeader
            {room}
            selected={selectedRoomId === room.id}
            unread={server.unread.get(room.id)}
            mentions={server.unread.getMentions(room.id)}
          />
        </button>
      </RoomContextMenu>
    {/if}
  {/each}
  {#if server.user.permissions === 1}
    <Dialog.Root bind:open={editOpen}>
      <Dialog.Trigger>
        <Button variant="ghost" class="size-8">
          <PlusIcon class="size-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Content class="max-w-2xl">
        <RoomForm onsubmit={onRoomSubmit} oncalcel={() => {editOpen = false}} />
      </Dialog.Content>
    </Dialog.Root>
  {/if}
</div>
