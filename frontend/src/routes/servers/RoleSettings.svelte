<script lang="ts">
  import { Plus, Settings, Trash } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import type { Server } from "$lib/servers.svelte";
  import type { RoleWithColorHex, UserWithRoles } from "$lib/users.svelte";
  import EditableTextField from "./EditableTextField.svelte";

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
            },
          });
        }}
      >
        <Plus />
      </Button>
    {/if}
  </div>
</div>

<div class="flex w-full flex-col gap-2">
  {#each server.users.roles as role (role.id)}
    <Separator />
    {#if editingRoleId === role.id}
      <div class="flex flex-row items-center justify-between gap-2">
        <div class="flex min-w-0 flex-row items-center gap-2">
          <div
            class="size-4 shrink-0 rounded-full border"
            style:background-color={role.colorHex}
          ></div>
          <p class="truncate">{role.name}</p>
        </div>
        <div>
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
          <Button
            variant="secondary"
            onclick={() => {
              editingRoleId = undefined;
            }}
          >
            <Settings />
          </Button>
        </div>
      </div>

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

      <div class="mt-2 flex flex-col gap-2">
        <p class="text-sm font-medium">Пользователи</p>
        {#each server.users.list as user (user.id)}
          {@const checked = hasRole(user, role.id)}
          <div
            class="flex items-center justify-between gap-3 rounded border px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{user.username}</p>
              <p class="text-muted-foreground truncate text-xs">@{user.name}</p>
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
    {:else}
      <div class="flex flex-row items-center justify-between gap-2">
        <div class="flex min-w-0 flex-row items-center gap-2">
          <div
            class="size-4 shrink-0 rounded-full border"
            style:background-color={role.colorHex}
          ></div>
          <p class="truncate">{role.name}</p>
        </div>
        <div class="flex items-center gap-3">
          <p class="text-muted-foreground text-sm">{assignedCount(role.id)}</p>
          <Button
            variant="secondary"
            onclick={() => {
              editingRoleId = role.id;
            }}
          >
            <Settings />
          </Button>
        </div>
      </div>
    {/if}
  {/each}
</div>
