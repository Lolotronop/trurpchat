<script lang="ts">
  import { gitGud } from "$lib/god.svelte";
  import Main from "./Main.svelte";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { Loader2Icon } from "@lucide/svelte";
  import { fade } from "svelte/transition";
    import { getAudioContext, initCustomModules } from "$lib/audiocontext";

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

  const context = getAudioContext();
  const p = Promise.all([
    initCustomModules(),
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
{:then}
  <Main />
{/await}
