<script lang="ts">
  import {
    fromDb,
    LocalSourceManager,
    MIN_DB,
    toDb,
  } from "./localAudioManager.svelte";
  import { Gateway } from "./gateway.svelte";
  import { WebRTC } from "./webrtc.svelte";
  import AnalyzerDisplay from "./AnalyzerDisplay.svelte";
  import MicSettings from "./MicSettings.svelte";
  import type { Action } from "svelte/action";
  import OvenPlayer from "ovenplayer";

  const {
    gateway,
    localSourceManager,
    audioContext,
    createLoudnessMeter,
  }: {
    gateway: Gateway;
    localSourceManager: LocalSourceManager;
    audioContext: AudioContext;
    createLoudnessMeter: () => AudioWorkletNode;
  } = $props();

  console.log("Hello world", createLoudnessMeter);
  let rtc = new WebRTC(
    gateway,
    localSourceManager,
    audioContext,
    createLoudnessMeter,
  );

  let wakelock = $state(false);
  navigator.wakeLock.request("screen").then((lock) => {
    wakelock = true;
  });

  let showMicSettings = $state(false);
  let showStream = $state(false);

  const setupOven: Action = (node) => {
    const player = OvenPlayer.create(node.id, {
      // controls: false,
      // disableSeekUI: true,
      sources: [
        {
          type: "webrtc",
          file: "ws://90.188.89.207:3333/app/test",
          label: "WebRTC Stream", // optional
          framerate: 60, // optional
        },
      ],
    });
    player.play();
    // ovenVolume = player.getVolume();
  };

  let room = $state("room1");
  let user = $state("user" + Math.random().toFixed(3).substring(2));
</script>

{#if gateway.connected && localSourceManager.hasPermissions}
  <main class="flex flex-col gap-4 p-8">
    <div>
      <button onclick={() => (showMicSettings = !showMicSettings)}>
        Mic settings
      </button>
    </div>

    {#if showMicSettings}
      <div class="flex flex-col gap-4">
        <button
          onclick={() => {
            localSourceManager.isMonitoring = !localSourceManager.isMonitoring;
          }}
        >
          Monitoring {localSourceManager.isMonitoring ? "on" : "off"}
        </button>
        <MicSettings localMediaManager={localSourceManager} {rtc} />
        <div class="flex flex-row gap-4">
          {#each localSourceManager.availableMics as mic}
            <button
              onclick={() => {
                localSourceManager.preferredInputDeviceId = mic.deviceId;
                localSourceManager.enableMic();
              }}
              style="background-color: {localSourceManager.preferredInputDeviceId ===
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
    <button onclick={() => rtc.joinRoom(user, room)}> Join </button>
    {#if showStream}
      <video id="stream" autoplay use:setupOven></video>
    {/if}
    <div
      class="h-6 w-6 rounded-full border-2 border-green-800"
      style="background-color: {localSourceManager.speaking
        ? 'green'
        : 'transparent'}"
    ></div>
    {#each Object.entries(rtc.peers) as [id, peer] (id)}
      <div class="flex w-[800px] flex-col">
        <p>{rtc.users.find((u) => u.id === id)?.username ?? id}</p>
        <input
          type="range"
          class="w-full"
          min={MIN_DB}
          max="16"
          step="0.1"
          bind:value={
            () => {
              const db = toDb(peer.volume!);
              return db;
            },
            (v) => {
              rtc.setVolume(id, fromDb(v));
            }
          }
        />
        <AnalyzerDisplay rms={peer.rms ?? 0} peak={peer.peak ?? 0} />
      </div>
    {/each}
  </main>
{:else}
  <p>Loading...</p>
{/if}
