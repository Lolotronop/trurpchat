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
    field: "name" | "displayName";
  };
  const { server, user, field }: Props = $props();

  // svelte-ignore state_referenced_locally
  let name: string | null = $state("");
  let editing = $state(false);
  // TODO: find a better way to do this
  $effect(() => {
    if (field === "displayName") {
      name = user.displayName ?? "";
    } else if (field === "name") {
      name = user.name;
    }
  });
  let input = $state<HTMLInputElement | null>(null);

  async function saveDisplayName() {
    if (name) name = name.trim();
    if (name && name.length === 0) {
      name = null;
    }
    server.gateway.send({
      type: "action.user.update",
      id: user.id,
      displayName: name,
    });
    return true;
  }

  async function saveName() {
    if (!name) return;

    if (name) name = name.trim();

    if (name.length < 2) {
      return;
    }

    if (name.includes(" ")) {
      // TODO: show error for includes spaces in name
      return;
    }

    server.gateway.send({
      type: "action.user.update",
      id: user.id,
      name: name,
    });
    return true;
  }

  async function save() {
    if (!editing) {
      editing = true;
      await tick();
      input?.focus();
      return;
    }

    let res;
    if (field === "displayName") {
      res = await saveDisplayName();
    } else if (field === "name") {
      res = await saveName();
    }
    if (!res) return;
    editing = false;
  }
</script>

<div class="flex flex-row items-center justify-between gap-2">
  <p class="min-w-8">{field === "name" ? "Тэг" : "Имя"}</p>
  {#if editing}
    <Input
      bind:ref={input}
      bind:value={name}
      onkeypress={(e) => {
        const key = e.key;

        if (key === "Enter") {
          save();
        }
      }}
      placeholder={field === "name" ? "Тэг" : "Имя"}
      class="w-full text-foreground"
    />
  {:else}
    <p class="w-full text-foreground">{name}</p>
  {/if}
  <Button variant="secondary" onclick={() => { save(); }}>
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
</div>
