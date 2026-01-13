<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Button } from "$lib/components/ui/button";
  import { gitGud } from "$lib/god.svelte";
  import {
    HeadphoneOff,
    Headphones,
    Info,
    Mic,
    MicOff,
    MonitorUp,
    PhoneOff,
  } from "@lucide/svelte";
  import Settings from "./Settings.svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  const g = gitGud();

  function formatTime(timeMS: number): string {
    const hours = Math.floor(timeMS / 3600000);
    const minutes = Math.floor((timeMS % 3600000) / 60000);
    const seconds = Math.floor((timeMS % 60000) / 1000);
    const pad = (num: number) => num.toString().padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  let rtc = $derived(g.servers.selected?.rtc);
</script>

<div class="text-muted-foreground rounded border-t px-2">
  {#if rtc !== undefined}
    <div class="flex flex-row items-center justify-between gap-2 py-2">
      <Tooltip.Provider>
        <Tooltip.Root delayDuration={100}>
          <Tooltip.Trigger class="flex flex-col items-start">
            <div class="hover:text-foreground flex flex-row items-center gap-2">
              Подключен к {rtc.room?.name}
              <Info size={16} />
            </div>
          </Tooltip.Trigger>
          <Tooltip.Content class="w-34">
            <div class="flex w-full flex-row items-center justify-center gap-2">
              <p class="text-muted-foreground font-mono text-sm">
                {formatTime(rtc.connectedFor)}
              </p>
            </div>
            <div>
              {#each rtc.room?.users! as user}
                {@const peer = rtc.peers.get(user.id)}
                <div class="flex w-full flex-row justify-between">
                  <p>
                    {user.name}
                  </p>
                  <p>
                    {peer?.ping ?? "N/A"}ms
                  </p>
                </div>
              {/each}
            </div>
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>

      <div class="flex flex-row items-center gap-2">
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={100}>
            <Tooltip.Trigger class="max-w-28">
              <Button
                variant={rtc.streaming ? "default" : "ghost"}
                class="size-8"
                onclick={() => {
                  rtc.streaming = !rtc.streaming;
                }}
              >
                <MonitorUp class="size-5" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content class="flex flex-row gap-2">
              <Switch id="airplane-mode" bind:checked={g.allowPause} />
              <Label for="airplane-mode">Разрешить удаленную паузу</Label>
            </Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
        <Button
          variant="ghost"
          class="size-8"
          onclick={() => {
            g.servers.selected?.leaveRoom();
          }}
        >
          <PhoneOff class="size-5" />
        </Button>
      </div>
    </div>
    <div class="border-t-[1px]"></div>
  {/if}
  <div
    class="bg-background flex h-16 w-full shrink flex-row items-center justify-between"
  >
    <!-- <div class="flex shrink flex-row items-center gap-1"> -->
    <!--   <Avatar.Root class="size-10"> -->
    <!--     <!-- <Avatar.Image src="https://github.com/shadcn.png" alt="@shadcn" /> --> -->
    <!--     <Avatar.Fallback class="select-none"> -->
    <!--       {g.settings.settings.username[0].toUpperCase()} -->
    <!--     </Avatar.Fallback> -->
    <!--   </Avatar.Root> -->
    <!--   <Tooltip.Provider> -->
    <!--     <Tooltip.Root delayDuration={100}> -->
    <!--       <Tooltip.Trigger class="max-w-28"> -->
    <!--         <p class="text-foreground overflow-hidden text-ellipsis"> -->
    <!--           {g.settings.settings.username} -->
    <!--         </p> -->
    <!--       </Tooltip.Trigger> -->
    <!--       <Tooltip.Content> -->
    <!--         {g.settings.settings.username} -->
    <!--       </Tooltip.Content> -->
    <!--     </Tooltip.Root> -->
    <!--   </Tooltip.Provider> -->
    <!-- </div> -->
    <div class="flex w-full max-w-28 flex-row items-center gap-2">
      <Button
        variant={g.muted ? "destructive" : "ghost"}
        class="size-8"
        onclick={() => {
          g.muted = !g.muted;
        }}
      >
        {#if !g.muted}
          <Mic class="size-5" />
        {:else}
          <MicOff class="size-5" />
        {/if}
      </Button>

      <Button
        variant={g.deafened ? "destructive" : "ghost"}
        class="size-8"
        onclick={() => {
          g.deafened = !g.deafened;
        }}
      >
        {#if !g.deafened}
          <Headphones class="size-5" />
        {:else}
          <HeadphoneOff class="size-5" />
        {/if}
      </Button>

      <Settings />
    </div>
  </div>
</div>
