<script lang="ts">
  import {
    DoorOpen,
    Loader2,
    Monitor,
    PictureInPicture,
    Tv,
    VolumeOff,
  } from "@lucide/svelte";
  import type {
    ConnectedUserWithRoles,
    UserWithRoles,
  } from "$lib/users.svelte";
  import Avatar from "$lib/components/Avatar.svelte";
  import LoudnessContextMenu from "$lib/components/LoudnessContextMenu.svelte";
  import { Item as ContextItem } from "$lib/components/ui/context-menu";
  import { Button } from "$lib/components/ui/button";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import type { Server } from "$lib/servers.svelte";
  import type { OvenPlayerController } from "./ovenplayer.svelte";

  type VirtualAnchor = {
    getBoundingClientRect: () => DOMRect;
  };

  type Props = {
    user: ConnectedUserWithRoles;
    server: Server;
    player: OvenPlayerController;
    shouldHideInfo?: boolean;
    shouldHideUi?: boolean;
    edgeToEdge?: boolean;
  };
  let {
    user,
    server,
    player,
    shouldHideInfo = false,
    shouldHideUi = false,
    edgeToEdge = false,
  }: Props = $props();

  const watcherUsers = $derived.by(() => {
    return user.watchedBy
      .map((id) => server.users.find(id))
      .filter((watcher): watcher is UserWithRoles => watcher !== undefined)
      .sort((a, b) => a.username.localeCompare(b.username));
  });
  const MAX_VISIBLE_WATCHERS = 4;
  const visibleWatcherUsers = $derived(
    watcherUsers.slice(0, MAX_VISIBLE_WATCHERS),
  );
  const hiddenWatcherCount = $derived(
    Math.max(watcherUsers.length - MAX_VISIBLE_WATCHERS, 0),
  );

  let contextOpen = $state(false);
  let contextAnchor = $state<VirtualAnchor | null>(null);

  $effect(() => {
    return () => {
      player.unmount();
    };
  });

  function attachPlayerHost(el: HTMLDivElement) {
    player.mount(el);

    return () => {
      player.unmount();
    };
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();

    contextAnchor = {
      getBoundingClientRect: () =>
        DOMRect.fromRect({
          x: event.clientX,
          y: event.clientY,
          width: 0,
          height: 0,
        }),
    };
    contextOpen = true;
  }

  function isMuted() {
    return player.gain === 0;
  }

  function setMuted(value: boolean) {
    player.setMuted(value);
  }
</script>

<ContextMenu.Root bind:open={contextOpen}>
  <ContextMenu.Trigger>
    <div
      class="aspect-video flex w-full items-center justify-center relative bg-black {edgeToEdge ? 'rounded-none' : 'rounded-md'}"
      oncontextmenucapture={handleContextMenu}
    >
      {#if player.state === "playing"}
        <div
          class="h-full w-full {edgeToEdge ? 'stream-host-edge-to-edge' : ''}"
          {@attach attachPlayerHost}
        ></div>
      {:else if player.state === "disconnected"}
        <Button
          variant="ghost"
          class="w-full h-full flex flex-col items-center justify-center"
          onclick={() => {
            player.start();
          }}
        >
          <div class="flex items-center gap-2 p-2">
            <Tv class="size-6" />
            <span style:color={user.colorHex}>Стрим {user.username}</span>
          </div>

          {#if watcherUsers.length > 0 && !shouldHideInfo}
            {@render watchersTooltip()}
          {/if}
        </Button>
      {:else}
        <div class="flex flex-col items-center justify-center gap-2">
          <Loader2 class="size-8 animate-spin" />
          <Button
            variant="ghost"
            class="hover:bg-destructive/20!"
            onclick={() => {
              player.stop();
            }}
          >
            <DoorOpen class="size-4" />
            Выйти
          </Button>
        </div>
      {/if}

      {#if player.state === "playing"}
        <div
          class="absolute inset-0 flex flex-col justify-between pointer-events-none"
        >
          {#if !shouldHideInfo && !shouldHideUi}
            <div class="flex w-full items-start justify-end p-2">
              {#if watcherUsers.length > 0}
                {@render watchersTooltip()}
              {/if}
            </div>
          {:else}
            <div></div>
          {/if}

          <div class="flex items-end justify-between gap-2 p-2">
            {#if !shouldHideInfo && !shouldHideUi}
              <div
                data-controls
                class="flex items-center gap-2 rounded-md bg-background/80 pointer-events-auto"
              >
                <p
                  class="text-foreground text-sm px-2 flex items-center gap-1"
                  style:color={user.colorHex}
                >
                  <Monitor class="size-4" />
                  {user.username}
                </p>

                <Button
                  class="p-0 hover:bg-destructive/50!"
                  variant="ghost"
                  onclick={() => {
                    player.stop();
                  }}
                >
                  <DoorOpen class="size-4" />
                </Button>
              </div>
            {:else}
              <div></div>
            {/if}
            {#if !shouldHideUi && player.gain === 0}
              <Button
                data-controls
                variant="ghost"
                class="flex items-center gap-2 p-2 hover:bg-accent/50 pointer-events-auto"
                onclick={() => {
                  player.setMuted(false);
                }}
              >
                <VolumeOff class="size-4" />
              </Button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </ContextMenu.Trigger>
  <ContextMenu.Content
    class="min-h-12 min-w-64 overflow-visible"
    customAnchor={contextAnchor}
  >
    <LoudnessContextMenu
      bind:gain={player.gain}
      bind:muted={() => isMuted(), (muted) => setMuted(muted)}
    />

    <ContextItem
      class="flex items-center justify-between"
      onclick={() => {
        player.requestPictureInPicture();
      }}
    >
      Picture in picture
      <PictureInPicture />
    </ContextItem>
  </ContextMenu.Content>
</ContextMenu.Root>

{#snippet watchersTooltip()}
  <Tooltip.Root>
    <Tooltip.Trigger
      data-controls
      class="pointer-events-auto rounded-md bg-background/75 px-2 py-1.5"
    >
      <div class="flex -space-x-2">
        {#each visibleWatcherUsers as watcher (watcher.id)}
          <Avatar
            name={watcher.username}
            class="size-6 border-2 border-background/90 bg-background"
          />
        {/each}
        {#if hiddenWatcherCount > 0}
          <div
            class="z-10 flex size-6 items-center justify-center rounded-full border-2 border-background/90 bg-muted text-xs font-medium text-foreground"
          >
            +{hiddenWatcherCount}
          </div>
        {/if}
      </div>
    </Tooltip.Trigger>
    <Tooltip.Content
      side="bottom"
      sideOffset={8}
      class="max-w-56 bg-background"
    >
      <div class="space-y-2">
        <p class="text-sm font-medium">Зритерей: {watcherUsers.length}</p>
        <div class="space-y-1">
          {#each watcherUsers as watcher (watcher.id)}
            <div class="flex items-center gap-2">
              <Avatar name={watcher.username} class="size-6 shrink-0" />
              <span
                class="truncate text-sm text-foreground"
                style:color={watcher.colorHex}
                >{watcher.username}</span
              >
            </div>
          {/each}
        </div>
      </div>
    </Tooltip.Content>
  </Tooltip.Root>
{/snippet}

<style>
  .stream-host-edge-to-edge > :global(div) {
    border-radius: 0;
  }

  .stream-host-edge-to-edge > :global(div) > :global(video) {
    border-radius: 0;
  }
</style>
