<script lang="ts">
  import { Settings } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Permission } from "trurpchat-shared";
  import type { Server } from "$lib/servers.svelte";
  import KeySettings from "./KeySettings.svelte";
  import RoleSettings from "./RoleSettings.svelte";
  import PermissionEditor from "./PermissionEditor.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();
</script>

<Dialog.Root>
  <Dialog.Trigger>
    <Button variant="ghost" class="size-8">
      <Settings class="size-5" />
    </Button>
  </Dialog.Trigger>
  <Dialog.Content class="max-w-3xl p-0! px-0! py-0!">
    <ScrollArea class="max-h-[80vh] w-full">
      <Dialog.Header>
        <Dialog.Title
          class="mb-3 flex flex-row justify-between px-6 pt-6 text-xl"
        >
          <p>Настройки сервера</p>
        </Dialog.Title>
        <Dialog.Description class="flex flex-col gap-8 px-6 pb-6">
          <div class="flex flex-col gap-2"><KeySettings {server} /></div>
          {#if server.can(Permission.MANAGE_ROLES)}
            <div class="flex flex-col gap-2"><RoleSettings {server} /></div>
          {/if}
          {#if server.can(Permission.MANAGE_PERMISSIONS)}
            <div class="flex flex-col gap-2">
              <h1 class="text-foreground mb-2 text-2xl">Базовые права</h1>
              <PermissionEditor {server} subjectType="everyone" />
            </div>
          {/if}
        </Dialog.Description>
      </Dialog.Header>
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>
