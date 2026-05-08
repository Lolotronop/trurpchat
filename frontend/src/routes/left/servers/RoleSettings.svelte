<script lang="ts">
  import { ChevronDown, ChevronRight, Plus, Settings, Trash, User, List } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import type { Server } from "$lib/servers.svelte";
  import {
    toColorHex,
    type RoleWithColorHex,
    type UserWithRoles,
  } from "$lib/users.svelte";
  import EditableTextField from "./EditableTextField.svelte";
  import PermissionEditor from "./PermissionEditor.svelte";
  import {
    DragDropProvider,
    PointerSensor,
    type DragDropEventHandlers,
  } from "@dnd-kit/svelte";
  import { createSortable, isSortable } from "@dnd-kit/svelte/sortable";
  import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
  import { RestrictToElement } from "@dnd-kit/dom/modifiers";
  import { PointerActivationConstraints } from "@dnd-kit/dom";
  import { Permission, type Role } from "trurpchat-shared";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  let editingRoleId: number | undefined = $state(undefined);
  let expandedUserRoleIds = $state(new Set<number>());
  let expandedPermissionRoleIds = $state(new Set<number>());
  let userSearch = $state("");

  function hasRole(user: UserWithRoles, roleId: number) {
    return user.roles.some((role) => role.id === roleId);
  }

  function toggleEditingRole(roleId: number) {
    if (editingRoleId === roleId) {
      editingRoleId = undefined;
    } else {
      editingRoleId = roleId;
    }
  }

  const filteredUsers = $derived.by(() => {
    const query = userSearch.trim().toLocaleLowerCase("ru-RU");
    if (!query) return server.users.list;

    return server.users.list.filter((user) => {
      return [user.username, user.name, user.displayName ?? ""].some((value) =>
        value.toLocaleLowerCase("ru-RU").includes(query),
      );
    });
  });

  function toggleSetValue(set: Set<number>, value: number) {
    const next = new Set(set);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    return next;
  }

  function assignedCount(roleId: number) {
    let count = 0;
    for (const user of server.users.list) {
      if (hasRole(user, roleId)) {
        count++;
      }
    }
    return count;
  }

  async function saveRoleName(roleId: number, value: string | null) {
    const name = value?.trim();
    if (!name) {
      return false;
    }

    server.gateway.send({
      type: "action.role.update",
      role: {
        id: roleId,
        name,
      },
    });
    return true;
  }

  function hexToColor(hex: string) {
    return Number.parseInt(hex.slice(1), 16);
  }

  function updateRoleColor(roleId: number, colorHex: string) {
    server.gateway.send({
      type: "action.role.update",
      role: {
        id: roleId,
        color: hexToColor(colorHex),
      },
    });
  }

  function toggleRole(user: UserWithRoles, role: Role, checked: boolean) {
    server.gateway.send({
      type: checked ? "action.role.assign" : "action.role.unassign",
      userId: user.id,
      roleId: role.id,
    });
  }

  const sorted = $derived(
    server.state.roles.toSorted((a, b) => b.order - a.order),
  );

  let parent: HTMLElement | undefined;
  function getSortable(role: Role, index: number) {
    const id = role.id;
    return createSortable({
      data: role,
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
      id,
      get index() {
        return index;
      },
    });
  }

  const onDragEnd: DragDropEventHandlers["onDragEnd"] = (event) => {
    if (event.canceled) return;
    const { source, target } = event.operation;
    if (!source || !target) return;
    if (source.id === target.id) return;
    if (!isSortable(source) || !isSortable(target)) return;
    if (target.index - source.index === 1) return; // no swap
    const from = source.data as RoleWithColorHex;
    const to = target.data as RoleWithColorHex;
    const pivot = sorted[target.index - 1];
    if (!pivot) return;
    const order = (pivot.order + to.order) / 2;
    for (const role of server.state.roles) {
      if (role.id === from.id) {
        role.order = order;
        break;
      }
    }
    server.gateway.send({
      type: "action.role.update",
      role: {
        ...from,
        order,
      },
    });
  };
</script>

<div class="flex flex-row items-center justify-between gap-2">
  <h1 class="text-foreground mb-2 text-2xl">Роли</h1>
  <div>
    {#if server.can(Permission.MANAGE_ROLES)}
      <Button
        variant="secondary"
        onclick={() => {
          server.gateway.send({
            type: "action.role.create",
            role: {
              name: "New role " + Math.random().toString(36).slice(2, 6),
              color: 0x888888,
              section: false,
            },
          });
        }}
      >
        <Plus />
      </Button>
    {/if}
  </div>
</div>

<div bind:this={parent} class="flex w-full flex-col gap-2">
  <DragDropProvider {onDragEnd}>
    {#each sorted as role, index (role.id)}
      {@const sortable = getSortable(role, index)}
      {#if index !== 0}
        <Separator
          class={[sortable.isDropTarget && "text-accent bg-accent"]}
          {@attach sortable.attachTarget}
        />
      {/if}

      <div
        class="flex h-full cursor-pointer flex-row items-center justify-between gap-2"
        role="button"
        tabindex="0"
        onclick={() => {
          toggleEditingRole(role.id);
        }}
        onkeydown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleEditingRole(role.id);
        }}
        {@attach sortable.attach}
      >
        <div class="flex min-w-0 flex-row items-center gap-2">
          <div
            class="flex size-6 cursor-grab items-center justify-center"
            {@attach sortable.attachHandle}
          >
            <List class="size-4" />
          </div>
          <p class="truncate" style:color={toColorHex(role.color)}>{role.name}</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-3">
            <p class="text-muted-foreground text-sm">
              {assignedCount(role.id)}
            </p>
            <User class="size-4" />
          </div>
          {#if editingRoleId === role.id}
            <Button
              variant="secondary"
              onclick={(event) => {
                event.stopPropagation();
                server.gateway.send({
                  type: "action.role.delete",
                  id: role.id,
                });
              }}
            >
              <Trash />
            </Button>
          {/if}
          <Button
            variant="secondary"
            onclick={(event) => {
              event.stopPropagation();
              toggleEditingRole(role.id);
            }}
          >
            <Settings />
          </Button>
        </div>
      </div>
      {#if editingRoleId === role.id}
        <EditableTextField
          label="Имя"
          value={role.name}
          placeholder="Имя"
          onSave={(value) => saveRoleName(role.id, value)}
        />

        <div class="flex items-center justify-between gap-2">
          <p class="min-w-8">Цвет</p>
          <div class="flex w-full items-center gap-3">
            <Input
              type="color"
              value={toColorHex(role.color)}
              class="h-10 w-16 p-1"
              onchange={(e) => {
                updateRoleColor(role.id, e.currentTarget.value);
              }}
            />
            <p class="text-muted-foreground text-sm">
              {toColorHex(role.color)}
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2">
          <p class="min-w-8">Секция</p>
          <div class="flex w-full items-center justify-end">
            <Switch
              checked={role.section}
              onclick={() => {
                server.gateway.send({
                  type: "action.role.update",
                  role: {
                    id: role.id,
                    section: !role.section,
                  },
                });
              }}
            />
          </div>
        </div>

        {#if server.can(Permission.MANAGE_PERMISSIONS)}
          <div class="mt-2 flex flex-col gap-2">
            <button
              type="button"
              class="flex items-center gap-2 text-left text-sm font-medium"
              onclick={() => {
                expandedPermissionRoleIds = toggleSetValue(expandedPermissionRoleIds, role.id);
              }}
            >
              {#if expandedPermissionRoleIds.has(role.id)}
                <ChevronDown class="size-4" />
              {:else}
                <ChevronRight class="size-4" />
              {/if}
              <span>Права</span>
            </button>
            {#if expandedPermissionRoleIds.has(role.id)}
              <PermissionEditor {server} subjectType="role" subjectId={role.id} />
            {/if}
          </div>
        {/if}

        <div class="mt-2 flex flex-col gap-2">
          <button
            type="button"
            class="flex items-center gap-2 text-left text-sm font-medium"
            onclick={() => {
              expandedUserRoleIds = toggleSetValue(expandedUserRoleIds, role.id);
            }}
          >
            {#if expandedUserRoleIds.has(role.id)}
              <ChevronDown class="size-4" />
            {:else}
              <ChevronRight class="size-4" />
            {/if}
            <span>Пользователи</span>
          </button>
          {#if expandedUserRoleIds.has(role.id)}
            <Input bind:value={userSearch} placeholder="Поиск пользователей" />
            {#each filteredUsers as user (user.id)}
              {@const checked = hasRole(user, role.id)}
              <div
                class="flex cursor-pointer items-center justify-between gap-3 rounded border px-3 py-2"
                role="button"
                tabindex="0"
                onclick={() => {
                  toggleRole(user, role, !checked);
                }}
                onkeydown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  toggleRole(user, role, !checked);
                }}
              >
                <div class="min-w-0">
                  <p
                    class="truncate text-sm font-medium text-foreground"
                    style:color={user.colorHex}
                  >
                    {user.username} <span class="text-muted-foreground">@{user.name}</span>
                  </p>
                </div>
                <Switch
                  {checked}
                  onclick={(event) => {
                    event.stopPropagation();
                    toggleRole(user, role, !checked);
                  }}
                />
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    {/each}
  </DragDropProvider>
</div>
