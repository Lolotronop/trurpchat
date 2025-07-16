<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  import OvenPlayer from "ovenplayer";
  import { onMount } from "svelte";
  import type { Action } from "svelte/action";
  import GainSlider from "./GainSlider.svelte";

  type Props = {
    name?: string;
  };
  let { name }: Props = $props();
  name ??= "test";

  // TODO: const for now, get from config later?
  const server = "90.188.89.207:3333";

  let g = gitGud();

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
    player = OvenPlayer.create(node.id, {
      controls: false,
      autoStart: true,
      showBigPlayButton: false,
      expandFullScreenUI: true,
      sources: [
        {
          type: "webrtc",
          file: `ws://${server}/app/${name}`,
        },
      ],
    });
    g.c.resume();

    let interval: any = null;
    player.on("stateChanged", (state) => {
      const el = player.getMediaElement();
      el.muted = true;
      el.addEventListener("canplay", () => {
        const stream: MediaStream =
          // @ts-ignore
          el.captureStream?.() ||
          // @ts-ignore
          el.mozCaptureStream?.() ||
          // @ts-ignore
          el.webkitCaptureStream?.();

        sourceNode = g.c.createMediaStreamSource(stream);
        sourceNode.connect(gainNode);

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
  };
</script>

<div class="relative">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video id="stream" use:setupOven></video>
  <div class="absolute top-0 right-0">
    <GainSlider bind:value={streamVolume} />
  </div>
</div>
