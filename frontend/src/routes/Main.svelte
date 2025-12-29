<script lang="ts">
import * as Dialog from "$lib/components/ui/dialog";
import * as Avatar from "$lib/components/ui/avatar";
import * as Tooltip from "$lib/components/ui/tooltip";
import { Button } from "$lib/components/ui/button";
import { gitGud } from "$lib/god.svelte";
import BottomControls from "./BottomControls.svelte";
import RoomList from "./RoomList.svelte";
import Stream from "./Stream.svelte";
    import ServerForm from "./ServerForm.svelte";
const g = gitGud();
// TODO: this needs to be removed with proper
// "speaking" sending
g.mic.enableAnalyzer();
</script>

<main class="flex h-screen w-screen">
  <div class="flex h-full flex-col border-r p-2">
      <div class="flex shrink flex-col items-center gap-1">
    {#each g.settings.settings.servers as server (server.url)}
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={100}>
            <Tooltip.Trigger class="max-w-28">
              <Avatar.Root class="size-10" onclick={() => {
                g.settings.settings.avtiveServerUrl = server.url;
              }}>
                <!-- <Avatar.Image src="https://github.com/shadcn.png" alt="@shadcn" /> -->
                <Avatar.Fallback class="select-none">
                  {server.name[0].toUpperCase()}
                </Avatar.Fallback>
              </Avatar.Root>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {server.name}
            </Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
    {/each}
      </div>
    <Dialog.Root>
      <Dialog.Trigger>
        <Button variant="ghost" class="size-8">
          <div class="flex flex-row items-center gap-2">
            +
          </div>
        </Button>
      </Dialog.Trigger>
      <Dialog.Content class="max-w-2xl p-0! px-0! py-0!">
        <ServerForm />
      </Dialog.Content>
    </Dialog.Root>
  </div>
  <div class="flex h-full min-w-[300px] flex-col border-r">
    <div class="flex w-full p-2 px-6 text-xl">ТРУРПЧР</div>
    <RoomList />
    <div class="w-full p-0.5">
      <BottomControls />
    </div>
  </div>
  <div class="flex h-full w-full flex-col items-center justify-center">
    {#if g.rtc.watching}
      <Stream name={g.rtc.watching} />
      <div class="flex w-full flex-row justify-between px-16"></div>
    {:else}
      <p>¯\_(ツ)_/¯</p>
    {/if}
  </div>
</main>
