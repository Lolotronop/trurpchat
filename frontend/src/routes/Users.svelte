<script lang="ts">
  import type { UserWithRoles, UserStore } from "$lib/users.svelte";
  import Avatar from "$lib/components/Avatar.svelte";

  type Props = {
    users: UserStore;
  };
  const { users }: Props = $props();
</script>

{#snippet u(user: UserWithRoles, online: boolean)}
  <div class="flex flex-row items-center gap-2">
    <Avatar class="size-6" name={user.username}></Avatar>
    <p class="truncate {online ? "text-foreground" : "text-muted-foreground"}">
      {user.username}
    </p>
  </div>
{/snippet}

<div class="flex flex-col gap-2 w-32 justify-start truncate">
  <h1 class="text-foreground text-lg">Online</h1>
  <div class="flex flex-col gap-2">
    {#each users.online as user (user.id)}
      {@render u(user, true)}
    {/each}
  </div>
  <h1 class="text-foreground text-lg">Offline</h1>
  <div class="flex flex-col gap-2">
    {#each users.offline as user (user.id)}
      {@render u(user, false)}
    {/each}
  </div>
</div>
