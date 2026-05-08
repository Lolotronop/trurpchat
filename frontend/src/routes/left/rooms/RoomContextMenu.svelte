<script lang="ts">
  import type { Snippet } from "svelte";
  import { Permission } from "trurpchat-shared";
  import type { RoomWithData } from "$lib/rooms.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import Item from "$lib/components/ContextMenuItem.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import type { Server } from "$lib/servers.svelte";
  import {
    CheckCheck,
    ChevronDown,
    ChevronRight,
    Pencil,
    Settings,
    Trash,
  } from "@lucide/svelte";
  import RoomForm, { type EditingRoom } from "./RoomForm.svelte";
  import RoomSettings from "./RoomSettings.svelte";
  import { Label } from "$lib/components/ui/label";
  import PermissionEditor from "../servers/PermissionEditor.svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";

  type Props = {
    server: Server;
    room: RoomWithData;
    children: Snippet;
  };

  const { server, children, room }: Props = $props();

  let editOpen = $state(false);
  let settingsOpen = $state(false);
  let expandedRoleIds = $state(new Set<number>());
  let expandedUserIds = $state(new Set<number>());

  function toggleSetValue(set: Set<number>, value: number) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }
  function onRoomSubmit(newRoom: EditingRoom) {
    const { type: _type, ...roomUpdate } = newRoom;
    server.gateway.send({
      type: "action.room.update",
      room: {
        id: room.id,
        ...roomUpdate,
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
  <Dialog.Content class="max-w-2xl p-0">
    <ScrollArea class="max-h-[calc(100vh-64px)] overflow-y-auto px-6 py-6">
      <div class="flex flex-col gap-6">
        <RoomForm
          initial={room}
          allowTypeEdit={false}
          onsubmit={onRoomSubmit}
          oncalcel={() => {editOpen = false}}
        />

        {#if server.can(Permission.MANAGE_PERMISSIONS)}
          <div class="flex flex-col gap-2">
            <Label>Роли</Label>
            {#each server.users.roles as role (role.id)}
              <div class="flex flex-col gap-2 rounded border px-3 py-2">
                <button
                  type="button"
                  class="flex items-center justify-between gap-2 text-left"
                  onclick={() => {
                  expandedRoleIds = toggleSetValue(expandedRoleIds, role.id);
                }}
                >
                  <span
                    class="truncate text-sm font-medium"
                    style:color={role.colorHex}
                    >{role.name}</span
                  >
                  {#if expandedRoleIds.has(role.id)}
                    <ChevronDown class="size-4" />
                  {:else}
                    <ChevronRight class="size-4" />
                  {/if}
                </button>
                {#if expandedRoleIds.has(role.id)}
                  <PermissionEditor
                    {server}
                    subjectType="role"
                    subjectId={role.id}
                    roomId={room.id}
                  />
                {/if}
              </div>
            {/each}
          </div>

          <div class="flex flex-col gap-2">
            <Label>Пользователи</Label>
            {#each server.users.list as user (user.id)}
              <div class="flex flex-col gap-2 rounded border px-3 py-2">
                <button
                  type="button"
                  class="flex items-center justify-between gap-2 text-left"
                  onclick={() => {
                  expandedUserIds = toggleSetValue(expandedUserIds, user.id);
                }}
                >
                  <span
                    class="truncate text-sm font-medium"
                    style:color={user.colorHex}
                  >
                    {user.username}
                    <span class="text-muted-foreground">@{user.name}</span>
                  </span>
                  {#if expandedUserIds.has(user.id)}
                    <ChevronDown class="size-4" />
                  {:else}
                    <ChevronRight class="size-4" />
                  {/if}
                </button>
                {#if expandedUserIds.has(user.id)}
                  <PermissionEditor
                    {server}
                    subjectType="user"
                    subjectId={user.id}
                    roomId={room.id}
                  />
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </ScrollArea>
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
