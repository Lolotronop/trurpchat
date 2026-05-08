<script lang="ts">
  import { Check, Slash, X } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import type { Server } from "$lib/servers.svelte";
  import {
    Permission,
    permissionInfo,
    type PermissionMask,
    type PermissionName,
    type PermissionRow,
    type PermissionSubjectType,
  } from "trurpchat-shared";

  type Props = {
    server: Server;
    subjectType: Extract<PermissionSubjectType, "user" | "role">;
    subjectId: number;
  };

  const { server, subjectType, subjectId }: Props = $props();

  let search = $state("");

  const permissions = $derived.by(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    const entries = Object.entries(permissionInfo) as [
      PermissionName,
      (typeof permissionInfo)[PermissionName],
    ][];

    if (!query) return entries;

    return entries.filter(([name, info]) =>
      [name, info.label, info.description].some((value) =>
        value.toLocaleLowerCase("ru-RU").includes(query),
      ),
    );
  });

  const row = $derived(
    server.state.permissions.find(
      (permission) =>
        permission.subjectType === subjectType &&
        permission.subjectId === subjectId &&
        permission.roomId === null,
    ),
  );

  function getValue(row: PermissionRow | undefined, bit: PermissionMask) {
    if ((row?.deny ?? 0) & bit) return "deny";
    if ((row?.allow ?? 0) & bit) return "allow";
    return "inherit";
  }

  function setValue(bit: PermissionMask, value: "deny" | "inherit" | "allow") {
    const allow = row?.allow ?? 0;
    const deny = row?.deny ?? 0;
    const next = {
      allow: value === "allow" ? (allow | bit) : (allow & ~bit),
      deny: value === "deny" ? (deny | bit) : (deny & ~bit),
    };

    if (row) {
      server.gateway.send({
        type: "action.permission.update",
        permission: {
          id: row.id,
          ...next,
        },
      });
    } else {
      server.gateway.send({
        type: "action.permission.create",
        permission: {
          subjectType,
          subjectId,
          roomId: null,
          ...next,
        },
      });
    }
  }
</script>

<div class="flex flex-col gap-2">
  <Input bind:value={search} placeholder="Поиск прав" />
  {#each permissions as [name, info] (name)}
    {@const bit = Permission[name]}
    {@const value = getValue(row, bit)}
    <div class="flex items-center justify-between gap-3 rounded border px-3 py-2">
      <div class="min-w-0">
        <p class="truncate text-sm font-medium">{info.label}</p>
        <p class="text-muted-foreground truncate text-xs">{info.description}</p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Button
          variant={value === "deny" ? "destructive" : "ghost"}
          size="icon"
          class={value === "deny" ? "" : "text-destructive"}
          aria-label="Запретить"
          onclick={() => setValue(bit, "deny")}
        >
          <X />
        </Button>
        <Button
          variant={value === "inherit" ? "secondary" : "ghost"}
          size="icon"
          class="text-muted-foreground"
          aria-label="Без изменений"
          onclick={() => setValue(bit, "inherit")}
        >
          <Slash />
        </Button>
        <Button
          variant={value === "allow" ? "default" : "ghost"}
          size="icon"
          class={value === "allow" ? "bg-accent text-accent-foreground hover:bg-accent/90" : "text-accent"}
          aria-label="Разрешить"
          onclick={() => setValue(bit, "allow")}
        >
          <Check />
        </Button>
      </div>
    </div>
  {/each}
</div>
