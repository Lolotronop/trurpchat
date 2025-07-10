<script lang="ts">
  import { LocalSourceManager } from "./localAudioManager.svelte";
  import Analyzer from "./Analyzer.svelte";
  import { Gateway } from "./gateway.svelte";
  import { WebRTC } from "./webrtc.svelte";
  import AnalyzerDisplay from "./AnalyzerDisplay.svelte";
  const localSourceManager = new LocalSourceManager();
  const gateway = new Gateway("ws://localhost:3000");
  const promise = localSourceManager.getPermissions().then(() => {
    localSourceManager.enableMic();
  });
  let rtc = new WebRTC(gateway, localSourceManager);

  $inspect(rtc.users);
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
      <p>{id}</p>
      <AnalyzerDisplay rms={peer.rms} peak={peer.peak} />
    {/each}
  </div>
{:else}
  <p>Loading...</p>
{/if}
