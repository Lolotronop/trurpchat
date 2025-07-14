<script lang="ts">
  import type { Action } from "svelte/action";
  import OvenPlayer from "ovenplayer";
  import AnalyzerDisplay from "./AnalyzerDisplay.svelte";
  import MicSettings from "./MicSettings.svelte";
  import { gitGud } from "$lib/god.svelte";
  import GainSlider from "./GainSlider.svelte";

  const g = gitGud();

  let WS_URL = "ws://lolo-desktop:3000";
  // let WS_URL = "ws://lolotronop.ru:3000";
  g.ws.connect(WS_URL);

  let showMicSettings = $state(false);
  let showStream = $state(false);

  let player: OvenPlayer.OvenPlayerInstance;
  $effect(() => {
    if (!showStream && player) {
      player.remove();
      console.log("Removing player");
    }
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
          file: "ws://90.188.89.207:3333/app/test",
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

  let room = $state("room1");
  let user = $state("user" + Math.random().toFixed(3).substring(2));

  let buttonColor = $derived.by(() => {
    if (g.mic.muted) {
      return "red";
    }
    if (g.mic.speaking) {
      return "green";
    }
    return "transparent";
  });
</script>

{#if g.ready}
  <main class="flex flex-col gap-4 p-8">
    <div>
      {#each g.keys.bindings.entries() as [action, shortcut] (action)}
        <div>
          {action}:
          <button
            onclick={() => {
              if (g.keys.detectingFor === action) {
                g.keys.stopDetect();
              } else {
                g.keys.detect(action);
              }
            }}
          >
            {g.keys.detectingFor === action ? "Cancel" : (shortcut ?? "None")}
          </button>
          <button onclick={() => g.keys.unset(action)}> Clear </button>
        </div>
      {/each}
    </div>

    <div>
      <button onclick={() => (showMicSettings = !showMicSettings)}>
        Mic settings
      </button>
      <button onclick={() => (showStream = !showStream)}> Stream </button>
      <button onclick={() => (g.mic.muted = !g.mic.muted)}
        >Mute {g.mic.muted ? "on" : "off"}</button
      >
    </div>

    {#if showMicSettings}
      <div class="flex flex-col gap-4">
        <button
          onclick={() => {
            g.mic.monitoring = !g.mic.monitoring;
          }}
        >
          Monitoring {g.mic.monitoring ? "on" : "off"}
        </button>
        <MicSettings />
        <div class="flex flex-row gap-4">
          {#each g.mic.devices as mic}
            <button
              onclick={() => {
                g.mic.preferredInputDeviceId = mic.deviceId;
                g.mic.connect();
              }}
              style="background-color: {g.mic.preferredInputDeviceId ===
              mic.deviceId
                ? 'green'
                : 'red'}"
            >
              {mic.label}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    <input type="text" bind:value={room} />
    <input type="text" bind:value={user} />
    <button
      onclick={() => {
        if (g.rtc.isConnected) {
          g.rtc.leaveRoom();
        } else {
          g.rtc.joinRoom(user, room);
        }
      }}
    >
      {g.rtc.isConnected ? `Leave ${g.rtc.room}` : `Join ${room}`}
    </button>
    {#if showStream}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video id="stream" autoplay use:setupOven></video>
      <button onclick={() => console.log(streamVolume, player.getVolume())}>
        Hmm
      </button>
      <GainSlider bind:value={streamVolume} />
    {/if}
    <div
      class="h-6 w-6 rounded-full border-2 border-green-800"
      style="background-color: {buttonColor}"
    ></div>
    {#each g.rtc.peers.entries() as [id, peer] (id)}
      <div class="flex flex-col">
        <p>{g.rtc.users.find((u) => u.id === id)?.username ?? id}</p>
        <div class="flex flex-row">
          <div class="flex w-full flex-col">
            <GainSlider bind:value={peer.volume} />
            <AnalyzerDisplay rms={peer.rms ?? 0} peak={peer.peak ?? 0} />
          </div>
          <div class="flex flex-col">
            <button
              style={peer.mute ? "background-color: red" : ""}
              onclick={() => (peer.mute = !peer.mute)}
            >
              M
            </button>
          </div>
        </div>
      </div>
    {/each}
  </main>
{:else}
  <p>Wating on</p>
  <p>Gateway: {g.ws.connected}</p>
  <p>Permissions {g.mic.hasPermissions}</p>
  <p>Wakelock: {!!g.lock}</p>
{/if}
