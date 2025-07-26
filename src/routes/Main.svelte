<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { gitGud } from "$lib/god.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import BottomControls from "./BottomControls.svelte";
  import RoomList from "./RoomList.svelte";
  import Stream from "./Stream.svelte";
  import { BaseDirectory, open, readFile } from "@tauri-apps/plugin-fs";
  const g = gitGud();
  // TODO: this needs to be removed with proper
  // "speaking" sending
  g.mic.enableAnalyzer();

  async function playWithAudioTag(bytes: Uint8Array, mimeType = "audio/mpeg") {
    // 1) Make a Blob
    const blob = new Blob([bytes], { type: mimeType });
    // 2) Create an object URL
    const url = URL.createObjectURL(blob);

    // 3) Create or re-use an <audio> element
    let audio: HTMLAudioElement | null = document.getElementById(
      "my-audio",
    ) as HTMLAudioElement;
    if (!audio) {
      audio = document.createElement("audio");
      audio.id = "my-audio";
      audio.preload = "auto"; // hint to browsers
      document.body.appendChild(audio);
    }

    // 4) Assign and play
    audio.src = url;
    await audio.play();

    // 5) Clean up the URL when done
    audio.onended = () => {
      URL.revokeObjectURL(url);
    };
  }
</script>

<main class="flex h-screen w-screen">
  <div class="flex h-full min-w-[300px] flex-col border-r">
    <div class="flex w-full p-2 px-6 text-xl">ТРУРПЧР</div>
    <RoomList />
    <div class="w-full p-0.5">
      <BottomControls />
    </div>
  </div>
  <div class="flex h-full w-full flex-col items-center justify-center">
    {#if g.rtc.watching}
      <Stream name={g.rtc.watching} />
      <div class="flex w-full flex-row justify-between px-16"></div>
    {:else}
      <p>¯\_(ツ)_/¯</p>
    {/if}
  </div>
</main>
