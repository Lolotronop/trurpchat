<script lang="ts">
  import type { ConnectedUser, User } from "trurpchat-backend";
  import * as Avatar from "$lib/components/ui/avatar";

  type Props = {
    online: ConnectedUser[];
    offline: User[];
  };
  const { online, offline }: Props = $props();
</script>

{#snippet u(user: User, online: boolean)}
  <div class="flex flex-row items-center gap-2">
    <Avatar.Root class="size-6">
      <Avatar.Fallback class="text-xs select-none">
        {user.name[0].toUpperCase()}
      </Avatar.Fallback>
    </Avatar.Root>
    <p class="{online ? "text-foreground" : "text-muted-foreground"}">
      {user.name}
    </p>
  </div>
{/snippet}

<div class="flex flex-col gap-2 w-32 justify-start">
  <h1 class="text-foreground text-lg">Online</h1>
  <div class="flex flex-col gap-2">
    {#each online as user (user.id)}{@render u(user, true)}{/each}
  </div>
  <h1 class="text-foreground text-lg">Offline</h1>
  <div class="flex flex-col gap-2">
    {#each offline as user (user.id)}{@render u(user, false)}{/each}
  </div>
</div>
