<script lang="ts">
  import * as Avatar from "$lib/components/ui/avatar";
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
  const g = gitGud();
  $inspect(g.rtc.room?.users);
</script>

<div class="rounded border px-2">
  {#if g.rtc.isConnected}
    <div class="flex flex-row items-center justify-between gap-2 p-2">
      <p>
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={100}>
            <Tooltip.Trigger>
              <div class="flex flex-row items-center gap-2">
                Подключен к {g.rtc.room?.name}
                <Info size={16} />
              </div>
            </Tooltip.Trigger>
            <Tooltip.Content
              class="text-foreground bg-neutral-800"
              arrowClasses="bg-neutral-800"
            >
              <div>
                {#each g.rtc.room?.users! as user}
                  {@const peer = g.rtc.peers.get(user.id)}
                  <div class="flex w-30 flex-row justify-between">
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
      </p>

      <Button
        variant={g.rtc.streaming ? "default" : "ghost"}
        class="size-8"
        onclick={() => {
          g.rtc.streaming = !g.rtc.streaming;
        }}
      >
        <MonitorUp />
      </Button>
      <Button
        variant="ghost"
        class="size-8"
        onclick={() => {
          g.rtc.leaveRoom();
        }}
      >
        <PhoneOff />
      </Button>
    </div>
    <div class="border"></div>
  {/if}
  <div
    class="bg-background:lighen flex h-16 w-full shrink flex-row items-center justify-between"
  >
    <div class="flex shrink flex-row items-center gap-1">
      <Avatar.Root class="size-10">
        <!-- <Avatar.Image src="https://github.com/shadcn.png" alt="@shadcn" /> -->
        <Avatar.Fallback class="select-none">
          {g.settings.settings.username[0].toUpperCase()}
        </Avatar.Fallback>
      </Avatar.Root>
      <Tooltip.Provider>
        <Tooltip.Root delayDuration={100}>
          <Tooltip.Trigger class="max-w-28">
            <p class="overflow-hidden text-ellipsis">
              {g.settings.settings.username}
            </p>
          </Tooltip.Trigger>
          <Tooltip.Content
            class="text-foreground bg-neutral-800"
            arrowClasses="bg-neutral-800"
          >
            {g.settings.settings.username}
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    </div>
    <div
      class="flex w-full max-w-28 flex-row items-center justify-around gap-2"
    >
      <Button
        variant={g.mic.muted ? "destructive" : "ghost"}
        class="size-8"
        onclick={() => {
          g.mic.muted = !g.mic.muted;
        }}
      >
        {#if !g.mic.muted}
          <Mic />
        {:else}
          <MicOff />
        {/if}
      </Button>

      <Button
        variant={g.rtc.deafened ? "destructive" : "ghost"}
        class="size-8"
        onclick={() => {
          g.rtc.deafened = !g.rtc.deafened;
        }}
      >
        {#if !g.rtc.deafened}
          <Headphones />
        {:else}
          <HeadphoneOff />
        {/if}
      </Button>

      <Settings />
    </div>
  </div>
</div>
