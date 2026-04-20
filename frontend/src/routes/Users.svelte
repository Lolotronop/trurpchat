<script lang="ts">
  import type { User } from "trurpchat-backend";
  import Avatar from "$lib/components/Avatar.svelte";
  import { username } from "$lib/utils.svelte";
  import type { UserStore } from "$lib/users.svelte";

  type Props = {
    users: UserStore;
  };
  const { users }: Props = $props();
</script>

{#snippet u(user: User, online: boolean)}
  <div class="flex flex-row items-center gap-2">
    <Avatar class="size-6" name={username(user)}></Avatar>
    <p class="truncate {online ? "text-foreground" : "text-muted-foreground"}">
      {username(user)}
    </p>
  </div>
{/snippet}

<div class="flex flex-col gap-2 w-32 justify-start truncate">
  <h1 class="text-foreground text-lg">Online</h1>
  <div class="flex flex-col gap-2">
    {#each users.onlineUsers as user (user.id)}
      {@render u(user, true)}
    {/each}
  </div>
  <h1 class="text-foreground text-lg">Offline</h1>
  <div class="flex flex-col gap-2">
    {#each users.offlineUsers as user (user.id)}
      {@render u(user, false)}
    {/each}
  </div>
</div>
