<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import type { Server } from "$lib/servers.svelte";
  import { PlusIcon } from "@lucide/svelte";
  import VoiceRoom from "./VoiceRoom.svelte";
  import RoomForm from "./RoomForm.svelte";
  import type { EditingRoom } from "./RoomForm.svelte";
  import TextRoom from "./TextRoom.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  const rtc = $derived(server.rtc);

  let editOpen = $state(false);
  function onRoomSubmit(room: EditingRoom) {
    server.gateway.send({
      type: "action.room.create",
      room,
    });
    editOpen = false;
  }

  $inspect(server.rooms);
</script>

<div class="h-full p-2">
  {#each server.rooms as room (room.id)}
    {#if room.type === "voice"}
      <VoiceRoom {room} server={server!} {rtc} />
    {/if}
    {#if room.type === "text"}
      <TextRoom {room} server={server!} />
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
