<script lang="ts">
  import {
    Clipboard,
    ChevronDown,
    ChevronRight,
    Loader2,
    Plus,
    RefreshCw,
    Settings,
    Shield,
    Trash,
    UserIcon,
    X,
  } from "@lucide/svelte";
  import { Permission, type Key, type Role } from "trurpchat-shared";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import type { Server } from "$lib/servers.svelte";
  import type { UserWithRoles } from "$lib/users.svelte";
  import EditableTextField from "./EditableTextField.svelte";
  import PermissionEditor from "./PermissionEditor.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  $effect(() => {
    if (server.keys.length === 0) {
      server.gateway.send({
        type: "action.key.list",
      });
    }
  });

  function formatDate(date: Date) {
    return date.toLocaleString("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  function groupById(items: Key[]): Map<UserWithRoles, Key[]> {
    const map = new Map<UserWithRoles, Key[]>();
    if (server.can(Permission.MANAGE_KEYS)) {
      for (const user of server.users.list) {
        map.set(user, []);
      }
    }
    for (const key of items) {
      const user = server.users.find(key.userId);
      if (!user) continue;
      const arr = map.get(user);
      if (arr) arr.push(key);
      else map.set(user, [key]);
    }
    return map;
  }

  const keyByUser = $derived(groupById(server.keys));

  let editingUserId: number | undefined = $state(undefined);
  let expandedKeyUserIds = $state(new Set<number>());
  let expandedRoleUserIds = $state(new Set<number>());
  let expandedPermissionUserIds = $state(new Set<number>());
  let roleSearch = $state("");

  const sortedRoles = $derived(
    server.users.roles.toSorted((a, b) => b.order - a.order),
  );

  const filteredRoles = $derived.by(() => {
    const query = roleSearch.trim().toLocaleLowerCase("ru-RU");
    if (!query) return sortedRoles;

    return sortedRoles.filter((role) =>
      role.name.toLocaleLowerCase("ru-RU").includes(query),
    );
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

  function hasRole(user: UserWithRoles, roleId: number) {
    return user.roles.some((role) => role.id === roleId);
  }

  function toggleRole(user: UserWithRoles, role: Role, checked: boolean) {
    server.gateway.send({
      type: checked ? "action.role.assign" : "action.role.unassign",
      userId: user.id,
      roleId: role.id,
    });
  }

  async function saveUserName(userId: number, value: string | null) {
    if (!value) return false;

    value = value.trim();
    if (value.length < 2) {
      return false;
    }
    if (value.includes(" ")) {
      return false;
    }

    server.gateway.send({
      type: "action.user.update",
      id: userId,
      name: value,
    });
    return true;
  }

  async function saveDisplayName(userId: number, value: string | null) {
    value = value?.trim() ?? null;
    if (value !== null && value.length === 0) {
      value = null;
    }

    server.gateway.send({
      type: "action.user.update",
      id: userId,
      displayName: value,
    });
    return true;
  }
</script>

<div class="flex flex-row items-center justify-between gap-2">
  <h1 class="text-foreground mb-2 text-2xl">Пользователи</h1>
  <div>
    {#if server.can(Permission.MANAGE_USERS)}
      <Button
        variant="secondary"
        onclick={() => {
          server.gateway.send({
            type: "action.user.create",
            name: "New" + Math.random().toString(36).slice(2),
          });
        }}
      >
        <Plus />
      </Button>
    {/if}
    <Button
      variant="secondary"
      onclick={() => {
        server.gateway.send({
          type: "action.key.list",
        });
      }}
    >
      <RefreshCw />
    </Button>
  </div>
</div>
<div class="flex w-full flex-col gap-2">
  {#if server.keys.length === 0}
    <Loader2 class="animate-spin" />
  {/if}
  {#each keyByUser.entries() as [ user, keys ] (user.id)}
    <Separator />
    <div
      class="flex h-full cursor-pointer flex-row items-center justify-between gap-2"
      role="button"
      tabindex="0"
      onclick={() => {
        if (editingUserId === user.id) {
          editingUserId = undefined;
        } else {
          editingUserId = user.id;
        }
      }}
      onkeydown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (editingUserId === user.id) {
          editingUserId = undefined;
        } else {
          editingUserId = user.id;
        }
      }}
    >
      <div class="flex min-w-0 flex-row items-center gap-2">
        <UserIcon class="size-4 shrink-0" />
        <p class="truncate text-foreground" style:color={user.colorHex}>
          {user.username}
          <span class="text-muted-foreground">@{user.name}</span>
        </p>
      </div>

      <div class="flex items-center gap-2">
        {#if editingUserId === user.id && server.can(Permission.MANAGE_USERS)}
          <Button
            variant="secondary"
            onclick={(event) => {
              event.stopPropagation();
              server.gateway.send({
                type: "action.user.delete",
                id: user.id,
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
            if (editingUserId === user.id) {
              editingUserId = undefined;
            } else {
              editingUserId = user.id;
            }
          }}
        >
          <Settings />
        </Button>
      </div>
    </div>

    {#if editingUserId === user.id}
      <EditableTextField
        label="Тэг"
        value={user.name}
        placeholder="Тэг"
        onSave={(value) => saveUserName(user.id, value)}
      />
      <EditableTextField
        label="Имя"
        value={user.displayName}
        placeholder="Имя"
        onSave={(value) => saveDisplayName(user.id, value)}
      />
      {#if server.can(Permission.MANAGE_PERMISSIONS)}
        <div class="mt-2 flex flex-col gap-2">
          <button
            type="button"
            class="flex items-center gap-2 text-left text-sm font-medium"
            onclick={() => {
              expandedPermissionUserIds = toggleSetValue(expandedPermissionUserIds, user.id);
            }}
          >
            {#if expandedPermissionUserIds.has(user.id)}
              <ChevronDown class="size-4" />
            {:else}
              <ChevronRight class="size-4" />
            {/if}
            <span>Права</span>
          </button>
          {#if expandedPermissionUserIds.has(user.id)}
            <PermissionEditor {server} subjectType="user" subjectId={user.id} />
          {/if}
        </div>
      {/if}

      {#if server.can(Permission.MANAGE_ROLES)}
        <div class="mt-2 flex flex-col gap-2">
          <button
            type="button"
            class="flex items-center gap-2 text-left text-sm font-medium"
            onclick={() => {
              expandedRoleUserIds = toggleSetValue(expandedRoleUserIds, user.id);
            }}
          >
            {#if expandedRoleUserIds.has(user.id)}
              <ChevronDown class="size-4" />
            {:else}
              <ChevronRight class="size-4" />
            {/if}
            <span>Роли</span>
          </button>
          {#if expandedRoleUserIds.has(user.id)}
            <Input bind:value={roleSearch} placeholder="Поиск ролей" />
            {#each filteredRoles as role (role.id)}
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
                <div class="flex min-w-0 items-center gap-2">
                  <p
                    class="truncate text-sm font-medium"
                    style:color={role.colorHex}
                  >
                    {role.name}
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

      <div class="mt-2 flex flex-col gap-2">
        <button
          type="button"
          class="flex items-center gap-2 text-left text-sm font-medium"
          onclick={() => {
            expandedKeyUserIds = toggleSetValue(expandedKeyUserIds, user.id);
          }}
        >
          {#if expandedKeyUserIds.has(user.id)}
            <ChevronDown class="size-4" />
          {:else}
            <ChevronRight class="size-4" />
          {/if}
          <span>Ключи</span>
        </button>
        {#if expandedKeyUserIds.has(user.id)}
          {#each keys as key (key.id)}
            <div class="flex flex-row items-center justify-between gap-2">
              <Button
                variant="secondary"
                onclick={() => {
                  const url = server.definition.url;
                  const base = url.match(/.*\?key=/);
                  if (!base || base.length < 1) {
                    return;
                  }
                  navigator.clipboard.writeText(base + key.key);
                }}
              >
                <Clipboard />
              </Button>
              <div
                class="flex w-[80%] flex-row items-center justify-between text-left"
              >
                <p class="text-muted-foreground text-base">{key.id}</p>
                <p class="text-muted-foreground text-base">
                  {formatDate(new Date(key.lastSeen))}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={!server.can(Permission.MANAGE_KEYS) && keys.length === 1}
                onclick={() => {
                  server.gateway.send({
                    type: "action.key.remove",
                    keyId: key.id,
                  });
                }}
              >
                <X />
              </Button>
            </div>
          {/each}
          <Button
            variant="secondary"
            class="mb-4"
            onclick={() => {
              server.gateway.send({
                type: "action.key.add",
                userId: user.id,
              });
            }}
          >
            +
          </Button>
        {/if}
      </div>
    {/if}
  {/each}
</div>
