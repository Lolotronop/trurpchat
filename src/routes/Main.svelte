<script lang="ts">
  import { fromDb, LocalSourceManager, toDb } from "./localAudioManager.svelte";
  import Analyzer from "./Analyzer.svelte";
  import { Gateway } from "./gateway.svelte";
  import { WebRTC } from "./webrtc.svelte";
  import AnalyzerDisplay from "./AnalyzerDisplay.svelte";

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

  let metersEnabled = $state(true);

  let room = $state("room1");
  let user = $state("user" + Math.random().toFixed(3).substring(2));
</script>

{#if gateway.connected && localSourceManager.hasPermissions}
  <div>
    <button onclick={() => localSourceManager.enableMic()}> Enable mic </button>
    <button onclick={() => localSourceManager.disableMic()}>
      Disable mic
    </button>
    <button onclick={() => localSourceManager.getMics()}> Get mics </button>
    <button onclick={() => (metersEnabled = !metersEnabled)}>
      Enable meters
    </button>
    <input type="text" bind:value={room} />
    <input type="text" bind:value={user} />
    <button onclick={() => rtc.joinRoom(user, room)}> Join </button>
    {#if metersEnabled}
      <Analyzer localMediaManager={localSourceManager} />
    {/if}
    {#each Object.entries(rtc.peers) as [id, peer] (id)}
      <div class="flex w-[800px] flex-col">
        <p>{id}</p>
        <input
          type="range"
          class="w-full"
          min="-60"
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
        <AnalyzerDisplay rms={peer.rms} peak={peer.peak} />
      </div>
    {/each}
  </div>
{:else}
  <p>Loading...</p>
{/if}
