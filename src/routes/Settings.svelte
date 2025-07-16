<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { gitGud } from "$lib/god.svelte";
  import { Settings } from "@lucide/svelte";
  import GainSlider from "./GainSlider.svelte";
  import AnalyzerDisplay from "./AnalyzerDisplay.svelte";
  import { Input } from "$lib/components/ui/input";
  const g = gitGud();
  g.mic.connect();

  let gatewayUrl = $state(g.settings.settings.gatewayServer);
</script>

<Dialog.Root
  onOpenChange={(open) => {
    if (open == false) {
      g.mic.monitoring = false;
    }
  }}
>
  <Dialog.Trigger>
    <Button variant="ghost" class="size-8">
      <Settings />
    </Button>
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title class="text-xl">Настройки</Dialog.Title>
      <Dialog.Description class="flex flex-col gap-2">
        <div class="flex flex-row justify-between">
          <h1 class="text-foreground text-lg">Микрофон</h1>
          <Button
            variant={g.mic.monitoring ? "secondary" : "outline"}
            onclick={() => {
              g.mic.monitoring = !g.mic.monitoring;
            }}
          >
            Прослушать
          </Button>
        </div>
        <h1>Усиление микрофона</h1>
        <GainSlider min={-12} bind:value={g.mic.gain} />
        <h1>Чувствительность</h1>
        <div
          class={`transition-[filter] duration-50 ${g.mic.speaking ? "" : "sepia-100"}`}
        >
          <AnalyzerDisplay rms={g.mic.rms} peak={g.mic.peak} />
        </div>
        <input
          type="range"
          bind:value={g.mic.gateThreshold}
          min={-54}
          max={0}
        />
        <h1>Выбор устройства</h1>
        <div class="flex flex-col gap-2">
          {#each g.mic.devices as device}
            <Button
              variant={g.mic.deviceId === device.deviceId
                ? "secondary"
                : "outline"}
              class="w-full justify-between text-left"
              onclick={() => {
                g.mic.deviceId = device.deviceId;
                g.mic.connect();
              }}
            >
              {device.label}
            </Button>
          {/each}
        </div>

        <h1 class="text-foreground text-lg">Сервер</h1>
        <div class="flex flex-row justify-between">
          <Input bind:value={gatewayUrl} />
          <Button
            onclick={() => {
              g.settings.settings.gatewayServer = gatewayUrl;
              g.ws.connect(`ws://${gatewayUrl}`);
            }}>Подключиться</Button
          >
        </div>
      </Dialog.Description>
    </Dialog.Header>
  </Dialog.Content>
</Dialog.Root>
