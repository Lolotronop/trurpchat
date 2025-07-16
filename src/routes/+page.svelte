<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import { gitGud } from "$lib/god.svelte";
  import Main from "./Main.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { Loader2Icon } from "@lucide/svelte";
  import { fade } from "svelte/transition";

  let perm: Promise<any>;
  const tauri = "__TAURI_INTERNALS__" in window;
  if (tauri) {
    perm = invoke("get_permissions", { origin: window.location.origin });
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
  let username = "";
</script>

{#await loaded}
  <div
    class="absolute z-10 flex h-screen w-screen flex-col items-center justify-center gap-2 p-8"
    transition:fade={{ duration: 200 }}
  >
    <Loader2Icon class="animate-spin" />
  </div>
{:then g}
  {#if g.ready && g.settings.settings.username !== "default"}
    <Main />
  {:else}
    <div
      class="bg-background absolute z-10 flex h-screen w-screen flex-col items-center justify-center gap-2 p-8"
      transition:fade={{ duration: 200 }}
    >
      {#if g.settings.ready && g.settings.settings.username === "default"}
        <Input
          type="text"
          placeholder="Имя пользователя"
          class="mb-2 max-w-80"
          bind:value={username}
        />
        <Button onclick={() => (g.settings.settings.username = username)}>
          Войти
        </Button>
      {:else}
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
          {@render l("G", g.ws.connected)}
          {@render l("M", g.mic.hasPermissions)}
        </div>
      {/if}
    </div>
  {/if}
{/await}
