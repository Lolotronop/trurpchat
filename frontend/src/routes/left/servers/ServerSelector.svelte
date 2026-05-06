<script lang="ts">
  import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
  import { PointerActivationConstraints } from "@dnd-kit/dom";
  import { RestrictToElement } from "@dnd-kit/dom/modifiers";
  import {
    type DragDropEventHandlers,
    DragDropProvider,
    PointerSensor,
  } from "@dnd-kit/svelte";
  import { createSortable, isSortable } from "@dnd-kit/svelte/sortable";
  import { Pencil, Trash } from "@lucide/svelte";
  import Avatar from "$lib/components/Avatar.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import Item from "$lib/components/ContextMenuItem.svelte";
  import { Button } from "$lib/components/ui/button";
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

  let snapshot: typeof servers.values = [];

  const onDragStart: DragDropEventHandlers["onDragStart"] = (_) => {
    snapshot = servers.values.slice();
  };

  const onDragOver: DragDropEventHandlers["onDragOver"] = (event) => {
    const { source, target } = event.operation;

    if (isSortable(source) && isSortable(target)) {
      const fromIndex = source.index;
      const toIndex = target.index;

      if (fromIndex !== toIndex) {
        const [removed] = servers.values.splice(fromIndex, 1);
        servers.values.splice(toIndex, 0, removed);
        servers.save();
      }
    }
  };

  const onDragEnd: DragDropEventHandlers["onDragEnd"] = (event) => {
    if (event.canceled) servers.values = snapshot;
  };

  let parent = document.getElementById("servers");
  function getSortable(server: ServerManager["values"][number], index: number) {
    const id = `${server.definition.id}-${server.definition.name}-${server.definition.url}`;
    return createSortable({
      modifiers: [
        RestrictToVerticalAxis,
        RestrictToElement.configure({
          element: parent,
        }),
      ],
      sensors: [
        PointerSensor.configure({
          activationConstraints: [
            new PointerActivationConstraints.Distance({ value: 25 }),
          ],
        }),
      ],
      id,
      get index() {
        return index;
      },
    });
  }
</script>

<div class="flex shrink flex-col items-center gap-1">
  <DragDropProvider {onDragEnd} {onDragOver} {onDragStart}>
    <div bind:this={parent} id="servers" class="flex flex-col gap-1">
      {#each servers.values as server, index (server.definition.name + server.definition.url)}
        {@const isSelected = servers.selected === server}
        {@const sortable = getSortable(server, index)}
        <div {@attach sortable.attach}>
          <ContextMenu>
            {#snippet menu()}
              <Item
                onclick={() => {
              editingServer = server;
            }}
              >
                Изменить
                <Pencil />
              </Item>
              <Item
                variant="destructive"
                onclick={() => {
              servers.remove(server);
            }}
              >
                Удалить
                <Trash />
              </Item>
            {/snippet}

            <Tooltip.Root delayDuration={100}>
              <Tooltip.Trigger class="max-w-28">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={() => {
                  servers.selected = server;
                }}
                  {@attach sortable.attachHandle}
                >
                  <Avatar
                    class="
                  {isSelected
                    ? 'ring-2 ring-accent'
                    : ''}
                  size-10"
                    name={server.definition.name}
                  ></Avatar>
                </div>
              </Tooltip.Trigger>
              <Tooltip.Content side="right">
                {server.definition.name}
              </Tooltip.Content>
            </Tooltip.Root>
          </ContextMenu>
        </div>
      {/each}
    </div>
  </DragDropProvider>

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
