<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  const g = gitGud();
  // TODO: this needs to be removed with proper
  // "speaking" sending
  g.mic.enableAnalyzer();

  import { HeadphoneOff, MicOff, TvMinimalPlay, Volume2 } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Avatar from "$lib/components/ui/avatar";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import GainSlider from "./GainSlider.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { toDb } from "$lib/utils.svelte";
</script>

<div class="h-full w-full p-2">
  {#each g.rtc.rooms as room (room.name)}
    <div>
      <Button
        variant="ghost"
        class="hover:text-foreground! flex w-full flex-row items-center justify-start text-base font-normal {g
          .rtc.room?.name === room.name
          ? ''
          : 'text-muted-foreground'}"
        onclick={() => g.rtc.joinRoom(room.name)}
      >
        <div class="flex flex-row items-center gap-2">
          <Volume2 size={16} strokeWidth={3} />
          <p>{room.name}</p>
        </div>
      </Button>
      <div class="flex flex-col pl-8">
        {#snippet u(
          username: string,
          speaking: boolean,
          mutedSelf: boolean,
          mutedByMe: boolean,
          deafened: boolean,
          streaming: boolean,
        )}
          <div
            class="hover:bg-accent/50 over flex flex-row items-center justify-between gap-2 rounded p-1 select-none"
          >
            <div class="flex flex-row items-center gap-2">
              <Avatar.Root
                class={`size-6 ${speaking ? "border-2 border-green-500" : ""}`}
              >
                <!-- <Avatar.Image src="https://github.com/shadcn.png" alt="@shadcn" /> -->
                <Avatar.Fallback class="text-xs select-none">
                  {username[0].toUpperCase()}
                </Avatar.Fallback>
              </Avatar.Root>
              <p
                class={g.rtc.room?.name === room.name
                  ? ""
                  : "text-muted-foreground"}
              >
                {username}
              </p>
            </div>
            <div class="flex h-6 flex-row items-center gap-2 pr-2">
              {#if mutedSelf || mutedByMe}
                <MicOff size={16} class={mutedByMe ? "text-yellow-600" : ""} />
              {/if}
              {#if deafened}
                <HeadphoneOff size={16} />
              {/if}
              {#if streaming}
                <Tooltip.Provider>
                  <Tooltip.Root delayDuration={100}>
                    <Tooltip.Trigger>
                      <Button
                        variant="ghost"
                        class="hover:text-primary-foreground hover:bg-destructive! size-6"
                        onclick={() => {
                          g.rtc.watching = username;
                        }}
                      >
                        <TvMinimalPlay class="size-4" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>Смотреть</Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              {/if}
            </div>
          </div>
        {/snippet}
        {#each room.users as user (user.id)}
          {@const peer = g.rtc.peers.get(user.id)}
          {#if user.id === g.rtc.clientId}
            {@render u(
              // TODO: change to actual username on the server?
              "USERNAME",
              !g.muted && g.mic.speaking,
              g.muted,
              false,
              g.deafened,
              user.streaming,
            )}
          {:else}
            <ContextMenu.Root>
              <ContextMenu.Trigger>
                {@render u(
                  user.name ?? "Error",
                  peer?.speaking ?? false,
                  user.muted,
                  peer?.mute ?? false,
                  user.deafened,
                  user.streaming,
                )}
              </ContextMenu.Trigger>
              <ContextMenu.Content class="min-h-12 min-w-64 overflow-visible">
                {#if peer}
                  <Button
                    variant="ghost"
                    class="flex w-full flex-row justify-between"
                    onclick={() => {
                      peer.mute = !peer.mute;
                    }}
                  >
                    <p>Замутить</p>
                    <Checkbox checked={peer.mute} />
                  </Button>

                  <div class="w-full px-2">
                    <p class="pl-2 text-sm font-normal">Громкость</p>
                    <GainSlider
                      bind:value={peer.volume}
                      min={-32}
                      max={toDb(2)}
                      ticks={[0]}
                    />
                  </div>
                {:else}
                  <p>:(</p>
                {/if}
              </ContextMenu.Content>
            </ContextMenu.Root>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>
