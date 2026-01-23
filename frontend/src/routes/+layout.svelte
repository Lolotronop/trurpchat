<script lang="ts">
  import { ModeWatcher } from "mode-watcher";
  import "../app.css";

  import { fade } from "svelte/transition";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { Loader2Icon } from "@lucide/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { gitGud } from "$lib/god.svelte";
  import { initCustomModules } from "$lib/audiocontext";

  let { children } = $props();

  let perm: Promise<any>;
  if (isTauri()) {
    perm = invoke("get_permissions", { origin: window.location.origin });
  } else {
    perm = Promise.resolve();
  }

  const p = Promise.all([initCustomModules(), perm]);

  const loaded = p.then(() => {
    return gitGud();
  });
</script>

<ModeWatcher defaultMode="dark" />

{#await loaded}
  <div
    class="absolute z-10 flex h-screen w-screen flex-col items-center justify-center gap-2 p-8"
    transition:fade={{ duration: 200 }}
  >
    <Loader2Icon class="animate-spin" />
  </div>
{:then}
  <Tooltip.Provider>
    {@render children()}
  </Tooltip.Provider>
{/await}
