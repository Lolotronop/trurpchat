<script lang="ts">
  import Avatar from "$lib/components/Avatar.svelte";
  import type { UserStore, UserWithRoles } from "$lib/users.svelte";

  type Props = {
    users: UserStore;
  };

  type UserSection = {
    id: number | "none";
    name: string;
    colorHex: string | undefined;
    count: number;
    users: UserWithRoles[];
    order: number;
  };

  const { users }: Props = $props();

  function getSectionRole(user: UserWithRoles) {
    return user.roles.find((role) => role.section);
  }

  function getUserColor(user: UserWithRoles, offline = false) {
    if (!offline) {
      return user.colorHex;
    }

    if (!user.colorHex) {
      return undefined;
    }

    return `color-mix(in srgb, ${user.colorHex} 45%, var(--muted-foreground) 55%)`;
  }

  function getHoverUserColor(user: UserWithRoles, offline = false) {
    if (!offline) {
      return user.colorHex;
    }

    return user.colorHex ?? "var(--foreground)";
  }

  const onlineSectioned = $derived.by(() => {
    const byRoleId = new Map<UserSection["id"], UserSection>();

    for (const user of users.online) {
      const role = getSectionRole(user);
      if (!role) {
        continue;
      }

      const id = role.id;
      const existing = byRoleId.get(id);

      if (existing) {
        existing.users.push(user);
        existing.count++;
        continue;
      }

      byRoleId.set(id, {
        id,
        name: role.name,
        colorHex: role.colorHex,
        count: 1,
        users: [user],
        order: role.order,
      });
    }

    return [...byRoleId.values()]
      .map((section) => ({
        ...section,
        users: [...section.users].sort((a, b) =>
          a.username.localeCompare(b.username),
        ),
      }))
      .sort((a, b) => b.order - a.order || a.name.localeCompare(b.name));
  });

  const onlineUnsectioned = $derived.by(() => {
    return users.online
      .filter((user) => !getSectionRole(user))
      .sort((a, b) => a.username.localeCompare(b.username));
  });

  const offlineUsers = $derived.by(() => {
    return [...users.offline].sort((a, b) =>
      a.username.localeCompare(b.username),
    );
  });
</script>

{#snippet userRow(user: UserWithRoles, offline = false)}
  <div
    class="group hover:bg-accent/20 -mx-1 flex flex-row items-center gap-2 rounded-xs px-2 py-1 transition-colors"
  >
    <Avatar class="size-6 shrink-0" name={user.username}></Avatar>
    <p class="truncate text-sm text-foreground transition-colors">
      <span
        class="user-name transition-colors"
        class:text-muted-foreground={offline && !user.colorHex}
        style:--user-color={getUserColor(user, offline)}
        style:--hover-user-color={getHoverUserColor(user, offline)}
      >
        {user.username}
      </span>
    </p>
  </div>
{/snippet}

<style>
  .user-name {
    color: var(--user-color, inherit);
  }

  .group:hover .user-name {
    color: var(--hover-user-color, inherit);
  }
</style>

{#snippet sectionHeader(name: string, count: number, colorHex: string | undefined, muted = false)}
  <div class="flex items-center justify-between gap-2 px-1 text-sm">
    <p
      class="truncate text-foreground"
      style:color={muted ? undefined : colorHex}
      class:text-muted-foreground={muted}
    >
      {name}
    </p>
    <p
      class="shrink-0 px-1.5 py-0.5"
      class:text-muted-foreground={muted}
      style:color={muted ? undefined : colorHex}
    >
      {count}
    </p>
  </div>
{/snippet}

<div class="flex w-42 flex-col justify-start gap-4 truncate p-1">
  {#each onlineSectioned as section (section.id)}
    <div class="flex flex-col gap-1.5">
      {@render sectionHeader(section.name, section.count, section.colorHex)}
      <div class="flex flex-col gap-0.5">
        {#each section.users as user (user.id)}
          {@render userRow(user)}
        {/each}
      </div>
    </div>
  {/each}

  {#if onlineUnsectioned.length > 0}
    <div class="flex flex-col gap-1.5">
      {@render sectionHeader("Online", onlineUnsectioned.length, undefined)}
      <div class="flex flex-col gap-0.5">
        {#each onlineUnsectioned as user (user.id)}
          {@render userRow(user)}
        {/each}
      </div>
    </div>
  {/if}

  <div class="border-border/60 flex flex-col gap-1.5 border-t pt-3">
    {@render sectionHeader("Offline", offlineUsers.length, undefined, true)}
    <div class="flex flex-col gap-0.5">
      {#each offlineUsers as user (user.id)}
        {@render userRow(user, true)}
      {/each}
    </div>
  </div>
</div>
