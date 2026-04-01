<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { Server } from "$lib/servers.svelte";
  import { Input } from "$lib/components/ui/input";
  import type { User } from "trurpchat-backend";
  import { Pencil, Save, Shield, User as UserIcon, X } from "@lucide/svelte";
  import { tick } from "svelte";

  type Props = {
    server: Server;
    user: User;
  };
  const { server, user }: Props = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(user.name);
  let editing = $state(false);
  // TODO: find a better way to do this
  $effect(() => {
    name = user.name;
  });
  let input = $state<HTMLInputElement | null>(null);

  async function saveName() {
    if (!editing) {
      editing = true;
      await tick();
      input?.focus();
      return;
    }
    if (name.length < 2) {
      return;
    }
    server.gateway.send({
      type: "action.user.update",
      id: user.id,
      name: name,
    });
    editing = false;
  }
</script>

<div class="flex flex-row items-center justify-between gap-2">
  {#if editing}
    <Input
      bind:ref={input}
      bind:value={name}
      onkeypress={(e) => {
        const key = e.key;

        if (key === "Enter") {
          saveName();
        }
      }}
      placeholder="Имя"
      class="w-full text-foreground"
    />
  {:else}
    <p class="w-full text-foreground">{user.name}</p>
  {/if}
  <Button variant="secondary" onclick={() => { saveName(); }}>
    {#if editing}
      <Save />
    {:else}
      <Pencil />
    {/if}
  </Button>
  {#if editing}
    <Button
      variant="secondary"
      onclick={() => {
        editing = false;
      }}
    >
      <X />
    </Button>
  {/if}
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
