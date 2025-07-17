<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { gitGud } from "$lib/god.svelte";
  import { Copy, Settings, X } from "@lucide/svelte";
  import GainSlider from "./GainSlider.svelte";
  import AnalyzerDisplay from "./AnalyzerDisplay.svelte";
  import { Input } from "$lib/components/ui/input";
  import { onMount } from "svelte";
  const g = gitGud();
  g.mic.connect();

  let gatewayUrl = $state(g.settings.settings.gatewayServer);
  let streamUrl = $derived(
    `srt://${g.settings.settings.ovenServer}:9999?streamid=srt%3A%2F%2F${g.settings.settings.ovenServer}%3A9999%2Fapp%2F${g.settings.settings.username}&latency=200000`,
  );
  let copied = $state(false);
  $effect(() => {
    if (copied) {
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  });

  let username = $state(g.settings.settings.username);
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
      <Dialog.Description class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
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
          <Select.Root
            type="single"
            onValueChange={(value) => {
              g.mic.deviceId = value;
              g.mic.connect();
            }}
          >
            <Select.Trigger class="w-full">
              {g.mic.devices.find(
                (device) => device.deviceId === g.mic.deviceId,
              )?.label ?? "Не выбрано"}
            </Select.Trigger>
            <Select.Content>
              {#each g.mic.devices as device}
                <Select.Item value={device.deviceId}>{device.label}</Select.Item
                >
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div>
          <h1 class="text-foreground text-lg">Стрим</h1>
          <div>
            <h1>Ссылка для OBS</h1>
            <div class="flex flex-row justify-between">
              <Input disabled={true} value={streamUrl}></Input>

              <Tooltip.Provider>
                <Tooltip.Root delayDuration={100}>
                  <Tooltip.Trigger>
                    <Button
                      variant="secondary"
                      class={`transitil-colors ${copied ? "bg-green-500 text-white hover:bg-green-500 hover:text-white" : ""}`}
                      onclick={() => {
                        navigator.clipboard.writeText(streamUrl);
                        copied = true;
                      }}><Copy /></Button
                    >
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    class="text-foreground bg-neutral-800"
                    arrowClasses="bg-neutral-800"
                  >
                    <div>{copied ? "Скопировано" : "Скопировать ссылку"}</div>
                  </Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>
          </div>
        </div>

        <div>
          <h1 class="text-foreground text-lg">Шорткаты</h1>
          {#each g.keys.bindings.entries() as [action, key] (action)}
            <div class="flex flex-row items-center justify-between">
              <p class="text-foreground text-base">{action}</p>
              <div class="flex flex-row items-center justify-between gap-2">
                <Tooltip.Provider>
                  <Tooltip.Root delayDuration={100}>
                    <Tooltip.Trigger
                      class="flex flex-row items-center justify-between"
                    >
                      <Button
                        variant="secondary"
                        class={`transitil-colors ${copied ? "bg-green-500 text-white hover:bg-green-500 hover:text-white" : ""}`}
                        onclick={() => {
                          if (g.keys.detectingFor === action) {
                            g.keys.stopDetect();
                          } else {
                            g.keys.detect(action);
                          }
                        }}
                      >
                        {#if g.keys.detectingFor === action}
                          Считываю...
                        {:else if key}
                          {key}
                        {:else}
                          Не задано
                        {/if}
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content
                      class="text-foreground bg-neutral-800"
                      arrowClasses="bg-neutral-800"
                    >
                      Нажмите чтобы задать!
                    </Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
                <Button
                  variant="secondary"
                  onclick={() => {
                    g.keys.unset(action);
                  }}
                >
                  <X />
                </Button>
              </div>
            </div>
          {/each}
        </div>
        <div>
          <h1 class="text-foreground text-lg">Никнейм</h1>
          <div class="flex flex-row justify-between gap-4">
            <Input bind:value={username} />
            <Button
              variant="secondary"
              onclick={() => {
                g.settings.settings.username = username;
                window.location.reload();
              }}>Сохранить</Button
            >
          </div>
        </div>
        <div>
          <h1 class="text-foreground text-lg">Сервер</h1>
          <div class="flex flex-row justify-between gap-4">
            <Input bind:value={gatewayUrl} />
            <Button
              variant="secondary"
              onclick={() => {
                g.settings.settings.gatewayServer = gatewayUrl;
                g.ws.connect(`ws://${gatewayUrl}`);
              }}>Подключиться</Button
            >
          </div>
        </div>
      </Dialog.Description>
    </Dialog.Header>
  </Dialog.Content>
</Dialog.Root>
