<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  import OvenPlayer from "ovenplayer";
  import { onMount } from "svelte";
  import type { Action } from "svelte/action";

  type Props = {
    name?: string;
  };
  let { name }: Props = $props();
  name ??= "test";

  // TODO: const for now, get from config later?

  let g = gitGud();
  const server = g.settings.settings.ovenServer;

  let player: OvenPlayer.OvenPlayerInstance;
  onMount(() => {
    return () => {
      player?.remove();
    };
  });

  let streamVolume = $state(1);
  const gainNode = g.c.createGain();
  gainNode.connect(g.c.destination);
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  $effect(() => {
    gainNode.gain.setTargetAtTime(streamVolume, g.c.currentTime, 0.01);
  });

  const setupOven: Action<HTMLVideoElement> = (node) => {
    $effect(() => {
      player = OvenPlayer.create(node.id, {
        // controls: false,
        autoStart: true,
        showBigPlayButton: false,
        playbackRates: [1],
        waterMark: undefined,
        title: "",
        // expandFullScreenUI: true,
        sources: [
          {
            type: "webrtc",
            file: `ws://${server}:3333/app/${name}`,
          },
        ],
      });
      g.c.resume();
      const container = player.getContainerElement();
      const badge = container.querySelector(
        ".op-live-badge-lowlatency",
      ) as HTMLSpanElement;
      if (badge) {
        badge.style.display = "none";
      }
      const play = container.querySelector(
        ".op-play-controller",
      ) as HTMLDivElement;
      if (play) {
        play.style.display = "none";
      }
      const settings = container.querySelector(
        ".setting-holder",
      ) as HTMLDivElement;
      if (settings) {
        settings.style.display = "none";
      }

      let interval: any = null;
      player.on("stateChanged", (state) => {
        const el = player.getMediaElement();
        // el.muted = true;
        el.addEventListener("canplay", () => {
          const stream: MediaStream =
            // @ts-ignore
            el.captureStream?.() ||
            // @ts-ignore
            el.mozCaptureStream?.() ||
            // @ts-ignore
            el.webkitCaptureStream?.();

          // sourceNode = g.c.createMediaStreamSource(stream);
          // sourceNode.connect(gainNode);
          const time = container.querySelector(
            ".op-time-display",
          ) as HTMLDivElement;
          if (time) {
            time.style.display = "none";
            time.style.opacity = "0";
          }

          let lastDrop = 0;
          interval = setInterval(() => {
            const q = el.getVideoPlaybackQuality();
            const p = (q.droppedVideoFrames / q.totalVideoFrames) * 100;
            if (q.droppedVideoFrames > lastDrop) {
              console.log(
                "Dropping frames!",
                q.totalVideoFrames,
                q.droppedVideoFrames,
                p.toFixed(2),
              );
              lastDrop = q.droppedVideoFrames;
            }
          }, 1000);
        });
        if (state.newstate !== "playing") {
          clearInterval(interval);
          interval = null;
          sourceNode?.disconnect();
          sourceNode = null;
        }
      });
    });
  };

  let hovering = $state(false);

  const setupUi: Action = (node) => {
    const c = player.getContainerElement().querySelector(".op-player");
    if (!c) {
      console.error("Player UI container not found");
      return;
    }
    c.prepend(node);
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative flex h-fit w-full items-center justify-center"
  onmouseenter={() => (hovering = true)}
  onmouseleave={() => (hovering = false)}
>
  <!-- svelte-ignore a11y_media_has_caption -->
  <video id="stream" use:setupOven></video>
  <!-- <div
    class="absolute bottom-0 left-0 z-20 flex w-full flex-row bg-neutral-900/90 {hovering
      ? ''
      : 'hidden'}"
    use:setupUi
  >
    <div class="w-full px-8">
      <GainSlider bind:value={streamVolume} />
    </div>
    <div>
      <Button
        variant="ghost"
        onclick={() => {
          player.toggleFullScreen();
        }}
      >
        <Maximize />
      </Button>
    </div>
  </div> -->
</div>
