<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import type { ServerDefinition } from "$lib/servers.svelte";
  import { gitGud } from "$lib/god.svelte";

  const g = gitGud();
  let server: ServerDefinition = $state({
    name: "",
    url: "",
    username: "",
  });
</script>

<div>
  <Label for="name">Имя сервера</Label>
  <Input id="name" type="text" bind:value={server.name} />
  <Label for="url">URL сервера</Label>
  <Input id="url" type="text" bind:value={server.url} />
  <!-- <Label for="username">Имя пользователя</Label> -->
  <!-- <Input id="username" type="text" bind:value={server.} /> -->
  <Button
    variant="secondary"
    onclick={() => {
    g.servers.add(server);
    server = {
      name: "",
      url: "",
    };
  }}
  >
    Добавить
  </Button>
</div>
