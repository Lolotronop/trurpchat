<script lang="ts">
  import {
    DoorOpen,
    Fullscreen,
    Loader2,
    Monitor,
    Tv,
    Volume2,
    VolumeOff,
  } from "@lucide/svelte";
  import type { ConnectedUser, User } from "trurpchat-backend";
  import Avatar from "$lib/components/Avatar.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import type { Server } from "$lib/servers.svelte";
  import GainSlider from "../GainSlider.svelte";
  import type { OvenPlayerController } from "./ovenplayer.svelte";

  type Props = {
    user: ConnectedUser;
    server: Server;
    player: OvenPlayerController;
  };
  let { user, server, player }: Props = $props();

  const watcherUsers = $derived.by(() => {
    return user.watchedBy
      .map((id) => server.findUser(id))
      .filter((watcher): watcher is User => watcher !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  const MAX_VISIBLE_WATCHERS = 4;
  const visibleWatcherUsers = $derived(
    watcherUsers.slice(0, MAX_VISIBLE_WATCHERS),
  );
  const hiddenWatcherCount = $derived(
    Math.max(watcherUsers.length - MAX_VISIBLE_WATCHERS, 0),
  );

  let container: HTMLDivElement | undefined = $state(undefined);
  let timeout: NodeJS.Timeout | undefined;
  let shouldHide = $state(true);
  let isFullscreen = $state(false);
  $effect(() => {
    return () => {
      clearTimeout(timeout);
      player.unmount();
    };
  });

  function attachPlayerHost(el: HTMLDivElement) {
    player.mount(el);

    return () => {
      player.unmount();
    };
  }

  function attachAutohide(el: HTMLDivElement) {
    const onMouseMove = (event: MouseEvent) => {
      clearTimeout(timeout);
      shouldHide = false;

      const target = event.target as HTMLElement;
      if (target.closest("[data-controls]")) {
        return;
      }

      timeout = setTimeout(() => {
        shouldHide = true;
      }, 2000);
    };

    const onMouseLeave = () => {
      clearTimeout(timeout);
      shouldHide = true;
    };

    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseleave", onMouseLeave);
    el.addEventListener("dblclick", toggleFullscreen);

    return () => {
      clearTimeout(timeout);
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mouseleave", onMouseLeave);
      el.removeEventListener("dblclick", toggleFullscreen);
    };
  }

  function toggleFullscreen(e: MouseEvent) {
    if (
      e.target instanceof HTMLElement &&
      !(
        e.target.closest("video") ||
        (e.target instanceof HTMLButtonElement && e.target.id === "fullscreen")
      )
    ) {
      return;
    }

    if (!container || player.state !== "playing") {
      return;
    }

    if (!isFullscreen) {
      container.requestFullscreen();
      isFullscreen = true;
    } else {
      document.exitFullscreen();
      isFullscreen = false;
    }
  }
</script>

<div
  class="aspect-video flex w-full justify-center items-center rounded-md relative bg-black"
  class:cursor-none={shouldHide}
  bind:this={container}
  {@attach attachAutohide}
>
  {#if player.state === "playing"}
    <div class="h-full w-full" {@attach attachPlayerHost}></div>
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
        Стрим {user.name}
      </div>

      {#if watcherUsers.length > 0}
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
      class="absolute inset-0 flex flex-col justify-between pointer-events-none transition-opacity duration-100 {shouldHide && 'opacity-0'}"
    >
      <div id="watchers" class="flex w-full items-start justify-end p-2">
        {#if watcherUsers.length > 0}
          {@render watchersTooltip()}
        {/if}
      </div>

      <div id="controls" class="flex items-end justify-between gap-2 p-2">
        <div
          data-controls
          class="flex items-center gap-2 rounded-md bg-background/80"
        >
          <p class="text-foreground text-sm px-2 flex items-center gap-1">
            <Monitor class="size-4" />
            {user.name}
          </p>

          <Button
            class="pointer-events-auto p-0 hover:bg-destructive/50!"
            variant="ghost"
            onclick={() => {
              player.stop();
            }}
          >
            <DoorOpen class="size-4" />
          </Button>
        </div>
        <div
          data-controls
          class="flex items-center gap-2 bg-background/80 rounded-md pointer-events-auto"
        >
          <div class="w-36 flex items-center gap-2">
            <Button
              variant="ghost"
              class="p-0"
              onclick={() => {
                player.toggleMuted();
              }}
            >
              {#if player.gain === 0}
                <VolumeOff class="size-4" />
              {:else}
                <Volume2 class="size-4" />
              {/if}
            </Button>
            <GainSlider
              class="w-full mt-1"
              bind:value={player.gain}
              ticks={[1]}
            />
          </div>
          <Button
            id="fullscreen"
            class="p-0"
            variant="ghost"
            onclick={toggleFullscreen}
          >
            <Fullscreen class="size-4" />
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>

{#snippet watchersTooltip()}
  <Tooltip.Root>
    <Tooltip.Trigger
      data-controls
      class="pointer-events-auto rounded-md bg-background/75 px-2 py-1.5"
    >
      <div class="flex -space-x-2">
        {#each visibleWatcherUsers as watcher (watcher.id)}
          <Avatar
            name={watcher.name}
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
              <Avatar name={watcher.name} class="size-6 shrink-0" />
              <span class="truncate text-sm">{watcher.name}</span>
            </div>
          {/each}
        </div>
      </div>
    </Tooltip.Content>
  </Tooltip.Root>
{/snippet}

<style>
  #watchers {
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.45) 0%,
      rgba(0, 0, 0, 0.22) 35%,
      rgba(0, 0, 0, 0) 100%
    );
    border-top-left-radius: inherit;
    border-top-right-radius: inherit;
  }

  #controls {
    background: linear-gradient(
      to top,
      rgba(0, 0, 0, 0.5) 0%,
      rgba(0, 0, 0, 0.4) 20%,
      rgba(0, 0, 0, 0.1) 60%,
      rgba(0, 0, 0, 0) 100%
    );
  }
</style>
