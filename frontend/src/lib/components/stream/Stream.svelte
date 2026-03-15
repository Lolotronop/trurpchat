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
  import type { User } from "trurpchat-backend";
  import { Button } from "$lib/components/ui/button";
  import type { Server } from "$lib/servers.svelte";
  import { OvenAudioController } from "./ovenplayer.svelte";
  import { fade } from "svelte/transition";
  import GainSlider from "../GainSlider.svelte";
  import {
    type OvenPlayerInstance,
    create as createOvenPlayer,
  } from "ovenplayer";
  import { audioctx } from "$lib/audio/context";

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
      lastOven = new OvenAudioController();
    }
    return lastOven;
  });

  $effect(() => {
    return () => {
      cleanup();
    };
  });

  function cleanup() {
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
    if (player) {
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
        // @ts-ignore
        // iceServers: ICE_CONFIG.iceServers,
      },
      sources: [
        {
          type: "webrtc",
          file: `ws://${server.overServerUrl!}/app/${user.id}`,
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
    });
  }

  let container: HTMLDivElement | undefined = $state(undefined);
  let timeout: NodeJS.Timeout | undefined;
  let shouldHide = $state(true);
  function attachAutohide(el: HTMLDivElement) {
    el.onmousemove = (event) => {
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

    el.onmouseleave = () => {
      clearTimeout(timeout);
      shouldHide = false;
    };

    el.addEventListener("dblclick", toggleFullscreen);
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
      class="w-full h-full"
      onclick={() => {
        cleanup();
        // TODO: also signal to the main server
        // that we are wathcing something
        oven.connect();
      }}
    >
      <Tv class="size-6" />
      Стрим {user.name}
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
  {#if oven.state === "connected" && !shouldHide}
    <div
      id="controls"
      class="absolute bottom-0 flex w-full justify-between p-2 pointer-events-none"
      transition:fade={{ duration: 100 }}
    >
      <div
        data-controls
        class="flex items-center gap-2 bg-background/80 rounded-md"
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
          <GainSlider class="w-full mt-1" bind:value={oven.gain} ticks={[1]} />
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
  {/if}
</div>

<style>
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
