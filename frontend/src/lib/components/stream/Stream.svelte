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
  import {
    create as createOvenPlayer,
    type OvenPlayerIceServer,
    type OvenPlayerInstance,
  } from "ovenplayer";
  import type { User } from "trurpchat-backend";
  import { audioctx } from "$lib/audio/context";
  import Avatar from "$lib/components/Avatar.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { gitGud } from "$lib/god.svelte";
  import type { Server } from "$lib/servers.svelte";
  import GainSlider from "../GainSlider.svelte";
  import { OvenAudioController } from "./ovenplayer.svelte";

  type Props = {
    user: User;
    server: Server;
  };
  let { user, server }: Props = $props();

  // TODO: this is a hack to prevent oven signaling from being recreated every time
  // figure out a better way to do this
  let lastOven: OvenAudioController | undefined;
  const oven: OvenAudioController = $derived.by(() => {
    if (!lastOven) {
      lastOven = new OvenAudioController(gitGud().headphones);
    }
    return lastOven;
  });
  const watcherUsers = $derived.by(() => {
    if (!user.online) {
      return [];
    }

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

  $effect(() => {
    return () => {
      cleanup();
    };
  });

  let watching = $state(false);
  function sendWatch() {
    if (watching || !server.connected) {
      return;
    }

    server.gateway.send({
      type: "action.voice.watch",
      userId: user.id,
    });
    watching = true;
  }

  function sendUnwatch() {
    if (!watching) {
      return;
    }

    watching = false;
    if (!server.connected) {
      return;
    }

    server.gateway.send({
      type: "action.voice.unwatch",
      userId: user.id,
    });
  }

  function cleanup() {
    sendUnwatch();
    clearTimeout(timeout);
    player?.stop();
    player?.remove();
    player = undefined;
    const el = document.getElementById(`oven-${user.id}`);
    if (el) {
      el.remove();
    }
    oven.disconnect();
  }

  let player: OvenPlayerInstance | undefined = $state(undefined);
  function attachStream(el: HTMLVideoElement) {
    if (player || !server.overServerUrl || !server.iceConfig) {
      return;
    }
    player = createOvenPlayer(el.id, {
      volume: 0,
      disableSeekUI: true,
      expandFullScreenUI: false,
      controls: false,
      autoStart: true,
      showBigPlayButton: false,
      playbackRate: 1,
      playbackRates: [1],
      waterMark: undefined,
      title: "",
      webrtcConfig: {
        playoutDelayHint: 0,
        iceServers: server.iceConfig.iceServers as OvenPlayerIceServer[],
      },
      sources: [
        {
          type: "webrtc",
          file: `ws://${server.overServerUrl}/app/${server.definition.id}-${user.id}`,
        },
      ],
    });

    player.on("stateChanged", async (state) => {
      if (state.newstate != "playing") {
        return;
      }
      const stream = player?.getMediaElement()?.srcObject as MediaStream;

      oven.audioSource = audioctx().createMediaStreamSource(stream);
      oven.audioSource.connect(oven.gainnode);
      if (server.user.id === user.id) {
        oven.gain = 0;
      }

      sendWatch();
    });
  }

  let container: HTMLDivElement | undefined = $state(undefined);
  let timeout: NodeJS.Timeout | undefined;
  let shouldHide = $state(true);
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

  let isFullscreen = $state(false);
  function toggleFullscreen(e: MouseEvent) {
    if (
      e.target &&
      !(
        e.target instanceof HTMLVideoElement ||
        (e.target instanceof HTMLButtonElement && e.target.id === "fullscreen")
      )
    ) {
      return;
    }

    if (!container || oven.state !== "connected") {
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
  let prevgain = 0.75;
</script>

<div
  class="aspect-video flex w-full justify-center items-center rounded-md relative bg-black"
  class:cursor-none={shouldHide}
  bind:this={container}
  {@attach attachAutohide}
>
  {#if oven.state === "connected"}
    <video
      class="w-full h-full object-fit rounded-md"
      id="oven-{user.id}"
      autoplay
      muted
      preload="auto"
      {@attach attachStream}
    ></video>
  {:else if oven.state === "disconnected"}
    <Button
      variant="ghost"
      class="w-full h-full flex flex-col items-center justify-center"
      onclick={() => {
        cleanup();
        oven.connect();
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
  {:else if oven.state === "connecting"}
    <div class="flex flex-col items-center justify-center gap-2">
      <Loader2 class="size-8 animate-spin" />
      <Button
        variant="ghost"
        class="hover:bg-destructive/20!"
        onclick={() => {
          cleanup();
          oven.disconnect();
        }}
      >
        <DoorOpen class="size-4" />
        Выйти
      </Button>
    </div>
  {:else}
    <p>¯\_(ツ)_/¯</p>
  {/if}

  <!-- controls -->
  {#if oven.state === "connected"}
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
              cleanup();
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
                if (oven.gain === 0) {
                  oven.gain = prevgain;
                } else {
                  prevgain = oven.gain;
                  oven.gain = 0;
                }
              }}
            >
              {#if oven.gain === 0}
                <VolumeOff class="size-4" />
              {:else}
                <Volume2 class="size-4" />
              {/if}
            </Button>
            <GainSlider
              class="w-full mt-1"
              bind:value={oven.gain}
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
