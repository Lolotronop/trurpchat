<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import { gitGud } from "$lib/god.svelte";
  import ServerForm from "./servers/ServerForm.svelte";
  import ServerSelector from "./servers/ServerSelector.svelte";
  import ServerUI from "./ServerUI.svelte";
  const g = gitGud();
</script>

<main class="flex h-screen w-screen">
  <div class="flex h-full flex-col border-r p-2">
    <ServerSelector servers={g.servers}></ServerSelector>
  </div>
  {#if g.servers.selected && g.servers.selected.connected}
    <ServerUI server={g.servers.selected}></ServerUI>
  {:else if g.servers.selected}
    <div class="flex w-full h-full flex-col items-center justify-center">
      Загрузка...
      <Button onclick={() => g.servers.selected?.reconnect()}>
        Переподключиться
      </Button>
    </div>
  {:else if g.servers.values.length > 0}
    <div class="flex w-full h-full flex-col items-center justify-center">
      Выберите сервер, к которому подключиться
    </div>
  {:else}
    <div class="flex w-full h-full flex-col items-center justify-center">
      <div class="w-96">
        <ServerForm
          onsubmit={(server) => {
            if (server === null) {
              return;
            }
            g.servers.add(server);
            g.servers.selected = g.servers.values[0];
          }}
        ></ServerForm>
      </div>
    </div>
  {/if}
</main>
