<script lang="ts">
  import Avatar from "$lib/components/Avatar.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Item } from "$lib/components/ui/context-menu";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import type { ServerManager } from "$lib/servers.svelte";
  import ServerForm from "./ServerForm.svelte";

  type Props = {
    servers: ServerManager;
  };

  const { servers }: Props = $props();

  let showServerForm = $state(false);
  let editingServer: ServerManager["values"][number] | undefined =
    $state(undefined);
</script>

<div class="flex shrink flex-col items-center gap-1">
  {#each servers.values as server (server.definition.name + server.definition.url)}
    {@const isSelected = servers.selected === server}
    <ContextMenu>
      {#snippet menu()}
        <Item
          onclick={() => {
            editingServer = server;
          }}
        >
          Изменить
        </Item>
        <Item
          variant="destructive"
          onclick={() => {
            servers.remove(server);
          }}
        >
          Удалить
        </Item>
      {/snippet}

      <Tooltip.Root delayDuration={100}>
        <Tooltip.Trigger class="max-w-28">
          <button
            onclick={() => {
              servers.selected = server;
            }}
          >
            <Avatar
              class="
              {isSelected
                ? 'ring-2 ring-accent'
                : ''}
              size-10"
              name={server.definition.name}
            ></Avatar>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content side="right">
          {server.definition.name}
        </Tooltip.Content>
      </Tooltip.Root>
    </ContextMenu>
  {/each}

  <Dialog.Root bind:open={showServerForm}>
    <Dialog.Trigger>
      <Button variant="ghost" class="size-8">
        <div class="flex flex-row items-center gap-2">+</div>
      </Button>
    </Dialog.Trigger>
    <Dialog.Content class="max-w-2xl p-0! px-0! py-0!">
      <ServerForm
        onsubmit={(server) => {
          if (server) servers.add(server);
          showServerForm = false;
        }}
      />
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root
    open={editingServer !== undefined}
    onOpenChange={(open) => {
      if (!open) editingServer = undefined;
    }}
  >
    <Dialog.Content class="max-w-2xl p-0! px-0! py-0!">
      {#if editingServer}
        <ServerForm
          initialServer={editingServer.definition}
          onsubmit={(server) => {
            const target = editingServer;
            if (server && target) servers.update(target, server);
            editingServer = undefined;
          }}
        />
      {/if}
    </Dialog.Content>
  </Dialog.Root>
</div>
