<script lang="ts">
    import {Input} from "$lib/components/ui/input";
    import {Button} from "$lib/components/ui/button";
    import {Label} from "$lib/components/ui/label";
    import type {Server} from "$lib/settings.svelte";
    import { gitGud } from "$lib/god.svelte";

    const g = gitGud();
    let server: Server  = $state({
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
  <Label for="username">Имя пользователя</Label>
  <Input id="username" type="text" bind:value={server.username} />
  <Button variant="secondary" onclick={() => {
    g.settings.settings.servers.push(server);
    server = {
      name: "",
      url: "",
      username: "",
    };
  }}>Добавить</Button>
</div>
