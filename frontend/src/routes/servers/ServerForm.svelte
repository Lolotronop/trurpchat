<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import type { ServerDefinition } from "$lib/servers.svelte";

  type Props = {
    onsubmit: (server: ServerDefinition | null) => void;
  };
  const { onsubmit }: Props = $props();

  let server: ServerDefinition = $state({
    name: "",
    url: "",
  });

  if (import.meta.env.DEV) {
    server = {
      name: "localhost",
      url: "ws://localhost:3000?key=vy84pxgkxm",
    };
  }

  function checkUrl(text: string): boolean {
    try {
      const url = new URL(text);
      const isWs = url.protocol === "ws:" || url.protocol === "wss:";
      const key = url.searchParams.get("key");
      return isWs && key !== null;
    } catch (e) {
      return false;
    }
  }

  let touchedUrl = $state(false);
  let isUrlValid = $derived(checkUrl(server.url));
  let shouldShowUrlError = $derived(
    server.url.length > 0 && touchedUrl && !isUrlValid,
  );

  function isValidName(text: string): boolean {
    return text.length > 0;
  }
  let touchedName = $state(false);
  let isNameValid = $derived(isValidName(server.name));
  let shouldShowNameError = $derived(
    server.name.length > 0 && touchedName && !isNameValid,
  );
</script>

<form class="flex flex-col gap-2 p-2 w-full" onsubmit={() => onsubmit(server)}>
  <h1 class="text-2xl">Добавить сервер</h1>

  <div>
    <Label for="name" class="mb-2">Название сервера</Label>
    <Input
      id="name"
      type="text"
      bind:value={server.name}
      oninput={() => {
        touchedName = true;
      }}
      aria-invalid={shouldShowNameError}
    />
    <p
      class="text-red-500 text-sm {shouldShowNameError ? 'visible' : 'hidden'}"
      aria-live="polite"
      aria-hidden={shouldShowNameError}
    >
      Неверное название
    </p>
  </div>

  <div>
    <Label for="url" class="mb-2">URL сервера</Label>
    <Input
      id="url"
      type="text"
      bind:value={server.url}
      oninput={() => {
        touchedUrl = true;
      }}
      aria-invalid={shouldShowUrlError}
    />
    <p
      class="text-red-500 text-sm {shouldShowUrlError ? 'visible' : 'hidden'}"
      aria-live="polite"
      aria-hidden={shouldShowUrlError}
    >
      Неверный URL
    </p>
  </div>
  <div class="w-full flex justify-between">
    <Button
      variant="secondary"
      onclick={() => {
        onsubmit(null);
      }}
    >
      Отмена
    </Button>

    <Button
      variant="default"
      disabled={!isUrlValid || !isNameValid}
      type="submit"
    >
      Добавить
    </Button>
  </div>
</form>
