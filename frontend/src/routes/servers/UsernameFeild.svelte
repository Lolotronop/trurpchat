<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { Server } from "$lib/servers.svelte";
  import { Input } from "$lib/components/ui/input";
  import type { User } from "trurpchat-backend";
  import { Pencil } from "@lucide/svelte";

  // TODO:
  type Props = {
    server: Server;
    user: User;
  };
  const { server, user }: Props = $props();

  let name = $state(user.name);
</script>

<div class="flex flex-row items-center justify-between gap-2">
  <Input bind:value={name} placeholder="Имя" class="w-full text-foreground" />
  <Button
    variant="secondary"
    onclick={() => {
      server.gateway.send({
        type: "action.user.rename",
        userId: user.id,
        name: name,
      });

      if (user.id === server.user.id) {
        server.user.name = name;
      }
    }}
  >
    <Pencil />
  </Button>
</div>
