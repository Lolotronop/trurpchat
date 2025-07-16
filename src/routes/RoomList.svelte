<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  const g = gitGud();
  // TODO: this needs to be removed with proper
  // "speaking" sending
  g.mic.enableAnalyzer();

  import { MicOff, Volume2 } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Avatar from "$lib/components/ui/avatar";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import GainSlider from "./GainSlider.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { toDb } from "$lib/utils.svelte";

  function setRooms(d: Rooms) {
    for (const [_, users] of Object.entries(d)) {
      users.sort((a, b) => a.username.localeCompare(b.username));
    }
    rooms = d;
  }
  g.ws.onmessage = (data) => {
    const d = data as {
      type: "rooms";
      rooms: Record<string, { id: string; username: string }[]>;
    };
    if (d.type === "rooms") {
      console.log("Got a message!", d);
      setRooms(d.rooms);
    }
  };
  fetch(`http://${g.settings.settings.gatewayServer}/rooms`)
    .then((res) => res.json())
    .then(setRooms);

  type User = { id: string; username: string };
  type Rooms = Record<string, User[]>;
  let rooms: Rooms = $state({});
</script>

<div class="h-full w-full p-2">
  {#each Object.entries(rooms) as [roomName, users] (roomName)}
    <div>
      <Button
        variant="ghost"
        class="flex w-full flex-row items-center justify-start text-base font-normal"
        onclick={() => g.rtc.joinRoom(roomName)}
      >
        <div class="flex flex-row items-center gap-2">
          <Volume2 size={16} strokeWidth={3} />
          <p>{roomName}</p>
        </div>
      </Button>
      <div class="flex flex-col pl-8">
        {#snippet u(
          username: string,
          speaking: boolean,
          mutedSelf: boolean,
          mutedByMe: boolean,
        )}
          <div
            class="flex flex-row items-center justify-between gap-2 rounded p-1 select-none hover:bg-neutral-800"
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
              <p>
                {username}
              </p>
            </div>
            <div class="flex flex-row items-center gap-2 pr-2">
              {#if mutedSelf || mutedByMe}
                <MicOff size={16} class={mutedSelf ? "" : "text-yellow-600"} />
              {/if}
            </div>
          </div>
        {/snippet}
        {#each users as user (user.id)}
          {@const peer = g.rtc.peers.get(user.id)}
          {#if user.id === g.rtc.clientId}
            {@render u(
              g.settings.settings.username,
              !g.mic.muted && g.mic.speaking,
              g.mic.muted,
              false,
            )}
          {:else}
            <ContextMenu.Root>
              <ContextMenu.Trigger>
                {@render u(
                  user.username ?? "Error",
                  peer?.speaking ?? false,
                  false,
                  peer?.mute ?? false,
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
