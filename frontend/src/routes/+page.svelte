<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  import Main from "./Main.svelte";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { Loader2Icon } from "@lucide/svelte";
  import { fade } from "svelte/transition";

  let perm: Promise<any>;
  const tauri = isTauri();
  if (tauri) {
    perm = invoke("get_permissions", { origin: window.location.origin });
    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      return false;
    });

    document.addEventListener("selectstart", (e) => {
      e.preventDefault();
      return false;
    });
  } else {
    perm = Promise.resolve();
  }

  const context = new AudioContext();
  const p = Promise.all([
    context.audioWorklet.addModule("noise-gate.js"),
    context.audioWorklet.addModule("loudness.js"),
    perm,
  ]);

  const loaded = p.then(() => {
    return gitGud(context, tauri);
  });
</script>

{#await loaded}
  <div
    class="absolute z-10 flex h-screen w-screen flex-col items-center justify-center gap-2 p-8"
    transition:fade={{ duration: 200 }}
  >
    <Loader2Icon class="animate-spin" />
  </div>
{:then g}
  {#if g.ready}
    <Main />
  {:else}
    <div
      class="bg-background absolute z-10 flex h-screen w-screen flex-col items-center justify-center gap-2 p-8"
      transition:fade={{ duration: 200 }}
    >
        <Loader2Icon class="animate-spin" />
        <div class="flex flex-row items-center justify-center gap-2">
          {#snippet l(label: string, value: boolean)}
            <div
              class="flex size-8 flex-col items-center justify-center rounded outline"
              class:bg-green-500={value}
            >
              {label}
            </div>
          {/snippet}

          {@render l("L", !!g.lock.wakeLock)}
          {@render l("S", g.settings.ready)}
          {@render l("M", g.mic.hasPermissions)}
        </div>
    </div>
  {/if}
{/await}
