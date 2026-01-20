<script lang="ts">
  import * as Avatar from "$lib/components/ui/avatar";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import type { ServerManager } from "$lib/servers.svelte";
  import ServerForm from "./ServerForm.svelte";

  type Props = {
    servers: ServerManager;
  };

  const { servers }: Props = $props();

  let showServerForm = $state(false);
</script>
<div class="flex shrink flex-col items-center gap-1">
  {#each servers.values as server (server.definition.url)}
    <Tooltip.Provider>
      <Tooltip.Root delayDuration={100}>
        <Tooltip.Trigger class="max-w-28">
          <Avatar.Root
            class="size-10"
            onclick={() => {
                servers.selected = server;
              }}
          >
            <!-- <Avatar.Image src="https://github.com/shadcn.png" alt="@shadcn" /> -->
            <Avatar.Fallback class="select-none">
              {server.definition.name[0].toUpperCase()}
            </Avatar.Fallback>
          </Avatar.Root>
        </Tooltip.Trigger>
        <Tooltip.Content>
          {server.definition.name}
          <Button
            onclick={() => {
                servers.remove(server);
              }}
          >
            Remove
          </Button>
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
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
