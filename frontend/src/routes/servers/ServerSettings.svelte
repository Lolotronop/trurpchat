<script lang="ts">
  import { Settings } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import type { Server } from "$lib/servers.svelte";
  import KeySetting from "./KeySetting.svelte";

  // TODO:
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
  <Dialog.Content class=" max-w-2xl p-0! px-0! py-0!">
    <ScrollArea class="max-h-[80vh] w-full">
      <Dialog.Header>
        <Dialog.Title
          class="mb-3 flex flex-row justify-between px-6 pt-6 text-xl"
        >
          <p>Настройки сервера</p>
        </Dialog.Title>
        <Dialog.Description class="flex flex-col gap-8 px-6 pb-6">
          <div class="flex flex-col gap-2"><KeySetting {server} /></div>
        </Dialog.Description>
      </Dialog.Header>
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>
