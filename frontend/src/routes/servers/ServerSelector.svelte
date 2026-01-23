<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import type { ServerManager } from "$lib/servers.svelte";
  import Avatar from "$lib/components/Avatar.svelte";
  import ServerForm from "./ServerForm.svelte";

  type Props = {
    servers: ServerManager;
  };

  const { servers }: Props = $props();

  let showServerForm = $state(false);
</script>

<div class="flex shrink flex-col items-center gap-1">
  {#each servers.values as server (server.definition.name + server.definition.url)}
    <Tooltip.Root delayDuration={100}>
      <Tooltip.Trigger class="max-w-28">
        <button
          onclick={() => {
            servers.selected = server;
          }}
        >
          <Avatar class="size-10" name={server.definition.name}></Avatar>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content side="right">
        {server.definition.name}
        <Button
          onclick={() => {
            servers.remove(server);
          }}
        >
          Удалить
        </Button>
      </Tooltip.Content>
    </Tooltip.Root>
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
</div>
