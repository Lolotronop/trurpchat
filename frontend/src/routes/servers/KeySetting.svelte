<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { Server } from "$lib/servers.svelte";
  import { Clipboard, Loader2, X } from "@lucide/svelte";
  import type { User } from "trurpchat-backend";
  import type { Key } from "trurpchat-backend/src/db";
  import UsernameFeild from "./UsernameFeild.svelte";

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

  function groupById(items: Key[]): Map<User, Key[]> {
    const map = new Map<User, Key[]>();
    for (const user of server.users.online) {
      map.set(user, []);
    }
    for (const user of server.users.offline) {
      map.set(user, []);
    }
    for (const key of items) {
      const user = server.findUser(key.userId);
      if (!user) continue;
      const arr = map.get(user);
      if (arr) arr.push(key);
      else map.set(user, [key]);
    }
    return map;
  }

  const keyByUser = $derived(groupById(server.keys));
</script>

<div class="flex flex-row justify-between items-center gap-2">
  <h1 class="text-foreground text-2xl mb-2">Пользователи</h1>
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
        Добавить
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
      Обновить
    </Button>
  </div>
</div>
<div class="flex w-full flex-col gap-2">
  {#if server.keys.length === 0}
    <Loader2 class="animate-spin" />
  {/if}
  {#each keyByUser.entries() as [user, keys] (user.id)}
    <UsernameFeild {server} {user} />
    {#each keys as key}
      <div class="flex flex-row items-center justify-between gap-2">
        <Button
          variant="secondary"
          onclick={() => {
            const url = server.definition.url;
            // TODO: make this more robust?
            // get everything before the key
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
          class="flex flex-row items-center justify-between w-[80%] text-left"
        >
          <p class="text-muted-foreground text-base">{key.id}</p>
          <p class="text-muted-foreground text-base">
            {formatDate(new Date(key.lastSeen))}
          </p>
        </div>
        <Button
          variant="secondary"
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
  {/each}
</div>
