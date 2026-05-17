<script lang="ts">
  import { Pencil } from "@lucide/svelte";
  import { onMount } from "svelte";
  import type { Server } from "$lib/servers.svelte";
  import type { UserWithRoles } from "$lib/users.svelte";

  type Props = {
    server: Server;
    roomId: number;
  };

  const { server, roomId }: Props = $props();

  const TYPING_TTL = 5000;
  let now = $state(new Date());

  onMount(() => {
    const interval = setInterval(() => {
      now = new Date();
    }, 1000);

    return () => clearInterval(interval);
  });

  function hasMessageAfterTyping(userId: number, typingTimestamp: Date) {
    const roomCache = server.messages.getRoom(roomId, false);
    if (!roomCache) return false;

    const lastBlock = roomCache.get(roomCache.lastBlockId(), false);
    if (!lastBlock) return false;

    for (let i = lastBlock.messages.length - 1; i >= 0; i--) {
      const message = lastBlock.messages[i];
      if (message.userId !== userId) continue;
      return message.createdAt.getTime() > typingTimestamp.getTime();
    }

    return false;
  }

  const typingUsers = $derived.by(() => {
    const currentTime = now.getTime();

    return server.typing.entries
      .filter((entry) => {
        return (
          entry.roomId === roomId &&
          entry.userId !== server.user.id &&
          currentTime - entry.timestamp.getTime() < TYPING_TTL &&
          !hasMessageAfterTyping(entry.userId, entry.timestamp)
        );
      })
      .map((entry) => server.users.find(entry.userId))
      .filter((user): user is UserWithRoles => user !== undefined);
  });

  const SHOW_USERS = 4;
  const visibleUsers = $derived(typingUsers.slice(0, SHOW_USERS));
  const remainingCount = $derived(Math.max(0, typingUsers.length - SHOW_USERS));
</script>

{#if typingUsers.length > 0}
  <div
    class="w-full bg-linear-to-t from-background to-transparent px-4 py-1 text-xs text-muted-foreground flex items-center gap-1.5"
  >
    <Pencil class="size-3 shrink-0" />
    <div class="min-w-0 truncate">
      {#if typingUsers.length === 1}
        {@const user = typingUsers[0]}
        <span class="font-medium" style:color={user.colorHex}
          >{user.username}</span
        >
        чепятает...
      {:else if typingUsers.length === 2}
        {@const first = typingUsers[0]}
        {@const second = typingUsers[1]}
        <span class="font-medium" style:color={first.colorHex}
          >{first.username}</span
        >
        и
        <span class="font-medium" style:color={second.colorHex}
          >{second.username}</span
        >
        чепятают...
      {:else}
        {#each visibleUsers as user, index (user.id)}
          {#if index > 0}
            ,
          {/if}
          <span class="font-medium" style:color={user.colorHex}
            >{user.username}</span
          >
        {/each}
        и еще {remainingCount}
        чепятают...
      {/if}
    </div>
  </div>
{/if}
