<script lang="ts">
  import { getAudioContext } from "$lib/audiocontext";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
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
  if (g.servers.selected === undefined) {
    throw new Error(
      "Tried to wathed a stream on a not selected server. How did you do that",
    );
  }
  // TODO: this depends on you still being on the selected server while watching the stream
  // which wont be always true. maybe store that separately?
  const server = g.servers.selected!.overServer;

  let isFullscreen = false;

  const keyboardCallback = (event: KeyboardEvent) => {
    console.log(event.key);
    if (event.key === " " && isFullscreen) {
      // TODO: same bug
      g.servers.selected?.gateway.send({ type: "action.voice.pause" });
    }
  };
  window.addEventListener("keydown", keyboardCallback);

  let player: OvenPlayer.OvenPlayerInstance;
  onMount(() => {
    return () => {
      player?.remove();
      window.removeEventListener("keydown", keyboardCallback);
    };
  });

  let bottomControls: any;

  let streamVolume = $state(1);
  const gainNode = getAudioContext().createGain();
  gainNode.connect(getAudioContext().destination);
  let sourceNode: MediaElementAudioSourceNode | null = null;
  $effect(() => {
    gainNode.gain.setTargetAtTime(
      streamVolume,
      getAudioContext().currentTime,
      0.01,
    );
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
      getAudioContext().resume();
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

      const leftcontrol = container.querySelector(
        ".op-left-controls",
      ) as HTMLDivElement;
      leftcontrol.style.display = "flex";
      leftcontrol.style.flexDirection = "row";
      leftcontrol.prepend(bottomControls);

      let interval: any = null;
      player.on("stateChanged", (state) => {
        const el = player.getMediaElement();
        // el.muted = true;
        el.addEventListener("canplay", () => {
          // const stream: MediaStream =
          //   // @ts-ignore
          //   el.captureStream?.() ||
          //   // @ts-ignore
          //   el.mozCaptureStream?.() ||
          //   // @ts-ignore
          //   el.webkitCaptureStream?.();

          // sourceNode = getAudioContext().createMediaStreamSource(stream);
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

        player.on("fullscreenChanged", (v) => {
          isFullscreen = v;
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
</script>

<div
  class="mr-4 flex h-full items-center justify-center gap-4"
  bind:this={bottomControls}
>
  <Button
    variant="destructive"
    onclick={() => (g.servers.selected!.rtc!.watching = null)}
  >
    Выйти
  </Button>

  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger>
        <Button
          onclick={() => {
          // TODO same bug
          g.servers.selected?.gateway.send({ type: "action.voice.pause" })
        }}
        >
          Пауза
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>Пробел в полном экране</Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
</div>

<div class="relative flex h-fit w-full items-center justify-center">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video id="stream" use:setupOven></video>
</div>
