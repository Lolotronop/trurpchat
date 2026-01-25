<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { Server } from "$lib/servers.svelte";
  import { Input } from "$lib/components/ui/input";
  import type { User } from "trurpchat-backend";
  import { Pencil, Shield, User as UserIcon, X } from "@lucide/svelte";

  // TODO:
  type Props = {
    server: Server;
    user: User;
  };
  const { server, user }: Props = $props();

  let name = $state(user.name);
  // TODO: find a better way to do this
  $effect(() => {
    name = user.name;
  });
</script>

<div class="flex flex-row items-center justify-between gap-2">
  <Input bind:value={name} placeholder="Имя" class="w-full text-foreground" />
  <Button
    variant="secondary"
    onclick={() => {
      server.gateway.send({
        type: "action.user.update",
        id: user.id,
        name: name,
      });
    }}
  >
    <Pencil />
  </Button>
  {#if server.user.permissions === 1}
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

    <Button
      variant="secondary"
      onclick={() => {
        server.gateway.send({
          type: "action.user.delete",
          id: user.id,
        });
      }}
    >
      <X />
    </Button>
  {/if}
</div>
