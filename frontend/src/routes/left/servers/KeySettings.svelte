<script lang="ts">
  import {
    Clipboard,
    Loader2,
    Plus,
    RefreshCw,
    Settings,
    Shield,
    Trash,
    UserIcon,
    X,
  } from "@lucide/svelte";
  import type { Key } from "trurpchat-shared";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import type { Server } from "$lib/servers.svelte";
  import type { UserWithRoles } from "$lib/users.svelte";
  import EditableTextField from "./EditableTextField.svelte";

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
    if (server.user.permissions === 1) {
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
    {#if server.user.permissions === 1}
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
    <div class="flex flex-row items-center justify-between gap-2">
      <div class="flex flex-row items-center gap-2">
        <p class="text-foreground" style:color={user.colorHex}>@{user.name}</p>
        <p class="text-foreground" style:color={user.colorHex}>
          {user.displayName && "| "}{user.displayName}
        </p>
      </div>

      <div>
        {#if editingUserId === user.id && server.user.permissions === 1}
          <Button
            variant="secondary"
            onclick={() => {
                server.gateway.send({
                  type: "action.user.delete",
                  id: user.id,
                });
              }}
          >
            <Trash />
          </Button>

          <Button
            variant="secondary"
            onclick={() => {
                const perm = user.permissions === 1 ? 0 : 1;
                server.gateway.send({
                  type: "action.user.update",
                  id: user.id,
                  permissions: perm,
                });
              }}
          >
            {#if user.permissions === 1}
              <Shield />
            {:else}
              <UserIcon />
            {/if}
          </Button>
        {/if}
        <Button
          variant="secondary"
          onclick={() => {
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
      <p>Ключи</p>
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
            disabled={server.user.permissions !== 1 && keys.length === 1}
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
    {:else}
    {/if}
  {/each}
</div>
