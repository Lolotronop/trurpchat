<script lang="ts">
  import {
    DragDropProvider,
    PointerSensor,
    type DragDropEventHandlers,
  } from "@dnd-kit/svelte";
  import { PointerActivationConstraints } from "@dnd-kit/dom";
  import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
  import { RestrictToElement } from "@dnd-kit/dom/modifiers";
  import { createSortable, isSortable } from "@dnd-kit/svelte/sortable";
  import { PlusIcon } from "@lucide/svelte";
  import { tick } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import type { Server } from "$lib/servers.svelte";
  import type { RoomWithData } from "$lib/rooms.svelte";
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
  const isAdmin = $derived(server.user.permissions === 1);
  const sorted = $derived(server.rooms.list);

  let editOpen = $state(false);
  let parent: HTMLElement | undefined;
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

  function getSortable(room: RoomWithData, index: number) {
    return createSortable({
      data: room,
      modifiers: [
        RestrictToVerticalAxis,
        RestrictToElement.configure({
          element: parent,
        }),
      ],
      sensors: [
        PointerSensor.configure({
          activationConstraints: [
            new PointerActivationConstraints.Distance({ value: 25 }),
          ],
        }),
      ],
      id: room.id,
      disabled: !isAdmin,
      get index() {
        return index;
      },
    });
  }

  const onDragEnd: DragDropEventHandlers["onDragEnd"] = (event) => {
    if (!isAdmin || event.canceled) return;
    const { source, target } = event.operation;
    if (!source || !target) return;
    if (source.id === target.id) return;
    if (!isSortable(source) || !isSortable(target)) return;
    if (target.index - source.index === 1) return;

    const from = source.data as RoomWithData;
    const to = target.data as RoomWithData;
    const pivot = sorted[target.index - 1];
    if (!pivot) return;

    const order = (pivot.order + to.order) / 2;
    server.gateway.send({
      type: "action.room.update",
      room: {
        id: from.id,
        order,
      },
    });
  };
</script>

<div bind:this={parent} class="h-full p-2 flex flex-col">
  <DragDropProvider {onDragEnd}>
    {#each sorted as room, index (room.id)}
      {@const sortable = getSortable(room, index)}
      {#if index !== 0}
        <div
          class={[
            "h-0.5 rounded",
            sortable.isDropTarget && "bg-accent",
          ]}
          {@attach sortable.attachTarget}
        ></div>
      {/if}
      <div {@attach sortable.attach}>
        {#if room.type === "voice"}
          <RoomContextMenu {room} {server}>
            <button
              type="button"
              class="contents"
              onclick={() => {
                setRoomId(room.id);
                server.joinRoom(room);
              }}
              {@attach sortable.attachHandle}
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
              {@attach sortable.attachHandle}
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
      </div>
    {/each}
  </DragDropProvider>
  {#if isAdmin}
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
