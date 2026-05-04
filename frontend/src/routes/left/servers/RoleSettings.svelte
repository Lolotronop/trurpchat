<script lang="ts">
  import { Plus, Settings, Trash, User, List } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import type { Server } from "$lib/servers.svelte";
  import type { RoleWithColorHex, UserWithRoles } from "$lib/users.svelte";
  import EditableTextField from "./EditableTextField.svelte";
  import {
    DragDropProvider,
    PointerSensor,
    type DragDropEventHandlers,
  } from "@dnd-kit/svelte";
  import { createSortable, isSortable } from "@dnd-kit/svelte/sortable";
  import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
  import { RestrictToElement } from "@dnd-kit/dom/modifiers";
  import { PointerActivationConstraints } from "@dnd-kit/dom";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  let editingRoleId: number | undefined = $state(undefined);

  function hasRole(user: UserWithRoles, roleId: number) {
    return user.roles.some((role) => role.id === roleId);
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

  function toggleRole(
    user: UserWithRoles,
    role: RoleWithColorHex,
    checked: boolean,
  ) {
    server.gateway.send({
      type: checked ? "action.role.assign" : "action.role.unassign",
      userId: user.id,
      roleId: role.id,
    });
  }

  const sorted = $derived(
    server.users.roles.toSorted((a, b) => b.order - a.order),
  );

  let parent: HTMLElement | undefined;
  function getSortable(role: RoleWithColorHex, index: number) {
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
    console.log(source.index, target.index);
    console.log(source.data, target.data);
    const from = source.data as RoleWithColorHex;
    const to = target.data as RoleWithColorHex;
    const pivot = sorted[target.index - 1];
    if (!pivot) return;
    from.order = (pivot.order + to.order) / 2;
    server.users.updateRole(from);
    server.gateway.send({
      type: "action.role.update",
      role: from,
    });
  };
</script>

<div class="flex flex-row items-center justify-between gap-2">
  <h1 class="text-foreground mb-2 text-2xl">Роли</h1>
  <div>
    {#if server.user.permissions === 1}
      <Button
        variant="secondary"
        onclick={() => {
          server.gateway.send({
            type: "action.role.create",
            role: {
              name: "New role " + Math.random().toString(36).slice(2, 6),
              color: 0x888888,
              permissions: 0,
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
        class="flex flex-row items-center justify-between gap-2 h-full"
        {@attach sortable.attach}
      >
        <div class="flex flex-row items-center gap-2">
          <div
            class="cursor-grab size-6 flex items-center justify-center"
            {@attach sortable.attachHandle}
          >
            <List class="size-4" />
          </div>
          <div
            class="size-4 shrink-0 rounded-full border"
            style:background-color={role.colorHex}
          ></div>
          <p class="truncate">{role.name}</p>
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
              onclick={() => {
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
            onclick={() => {
              if (editingRoleId === role.id) {
                editingRoleId = undefined;
              } else {
                editingRoleId = role.id;
              }
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
              value={role.colorHex}
              class="h-10 w-16 p-1"
              onchange={(e) => {
                updateRoleColor(role.id, e.currentTarget.value);
              }}
            />
            <p class="text-muted-foreground text-sm">{role.colorHex}</p>
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

        <div>
          <Input
            type="number"
            value={role.order}
            class="h-10 w-16 p-1"
            oninput={(e) => {
              server.gateway.send({
                type: "action.role.update",
                role: {
                  id: role.id,
                  order: Number(e.currentTarget.value),
                },
              });
            }}
          />
        </div>

        <div class="mt-2 flex flex-col gap-2">
          <p class="text-sm font-medium">Пользователи</p>
          {#each server.users.list as user (user.id)}
            {@const checked = hasRole(user, role.id)}
            <div
              class="flex items-center justify-between gap-3 rounded border px-3 py-2"
            >
              <div class="min-w-0">
                <p
                  class="truncate text-sm font-medium text-foreground"
                  style:color={user.colorHex}
                >
                  {user.username}
                </p>
                <p
                  class="truncate text-xs text-foreground"
                  style:color={user.colorHex}
                >
                  @{user.name}
                </p>
              </div>
              <Switch
                {checked}
                onclick={() => {
                  toggleRole(user, role, !checked);
                }}
              />
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  </DragDropProvider>
</div>
