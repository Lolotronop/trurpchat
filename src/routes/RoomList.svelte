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

  function setRooms(d: any) {
    console.log(d);
    const r = d;
    for (const roomName in r) {
      let users = r[roomName];
      users = users.filter((user) => user.id !== g.rtc.clientId);
      r[roomName] = users;
    }
    rooms = r;
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

  let rooms: Record<string, { id: string; username: string }[]> = $state({});
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
        {#snippet u(username: string, speaking: boolean, muted: boolean)}
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
              {#if muted}
                <MicOff size={16} />
              {/if}
            </div>
          </div>
        {/snippet}
        {#if g.rtc.room === roomName}
          {@render u(
            g.settings.settings.username,
            !g.mic.muted && g.mic.speaking,
            g.mic.muted,
          )}
        {/if}
        {#each users as user}
          {@const peer = g.rtc.peers.get(user.id)}
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              {@render u(
                user.username ?? "Error",
                peer?.speaking ?? false,
                peer?.mute ?? false,
              )}
            </ContextMenu.Trigger>
            <ContextMenu.Content class="min-h-12 min-w-64">
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
                  <GainSlider bind:value={peer.volume} min={-24} ticks={[0]} />
                </div>
              {:else}
                <p>:(</p>
              {/if}
            </ContextMenu.Content>
          </ContextMenu.Root>
        {/each}
      </div>
    </div>
  {/each}
</div>
