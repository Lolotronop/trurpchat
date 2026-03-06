<script lang="ts">
  import {
    DoorOpen,
    Fullscreen,
    Loader2,
    Monitor,
    Tv,
    Volume2,
  } from "@lucide/svelte";
  import type { User } from "trurpchat-backend";
  import { Button } from "$lib/components/ui/button";
  import type { Server } from "$lib/servers.svelte";
  import { OvenSignaling } from "./ovenplayer.svelte";
  import { fade } from "svelte/transition";
  import GainSlider from "../GainSlider.svelte";
  import {
    type OvenPlayerInstance,
    create as createOvenPlayer,
  } from "ovenplayer";

  type Props = {
    user: User;
    server: Server;
  };
  let { user, server }: Props = $props();

  // svelte-ignore state_referenced_locally
  const oven = $derived(new OvenSignaling(server.overServerUrl!, user.id));
  $effect(() => {
    return () => {
      cleanup();
    };
  });

  function cleanup() {
    player?.stop();
    player?.remove();
    const el = document.getElementById(`oven-${user.id}`);
    if (el) {
      el.remove();
    }
    oven.disconnect();
  }

  let video: HTMLVideoElement | undefined = $state(undefined);
  let player: OvenPlayerInstance | undefined = $state(undefined);
  function attachStream(el: HTMLVideoElement) {
    // if (!oven.stream) {
    //   console.warn("[OVEN] attachStream called with no stream");
    //   return;
    // }
    // el.srcObject = oven.stream;
    // el.play()
    //   .then(() => {})
    //   .catch((e) => console.error(e));
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
      sources: [
        {
          type: "webrtc",
          file: `ws://${server.overServerUrl!}/app/${user.id}`,
        },
      ],
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
      shouldHide = true;
    };

    el.addEventListener("dblclick", toggleFullscreen);
  }

  let isFullscreen = $state(false);
  function toggleFullscreen() {
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
      bind:this={video}
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
    <Loader2 class="size-8 animate-spin" />
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
          class="pointer-events-auto p-0 hover:bg-destructive/50"
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
        class="flex items-center gap-2 bg-background/80 rounded-md"
      >
        <div class="w-36 pointer-events-auto pl-2 flex items-center gap-2">
          <!-- TODO: make this better. the icon is tiny, slider is buggy -->
          <Volume2 class="size-6" />
          <GainSlider class="w-full" bind:value={oven.gain} ticks={[1]} />
        </div>
        <Button
          class="pointer-events-auto p-0"
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
