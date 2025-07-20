<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { gitGud } from "$lib/god.svelte";
  import { Copy, MoonIcon, Scroll, Settings, SunIcon, X } from "@lucide/svelte";
  import GainSlider from "./GainSlider.svelte";
  import AnalyzerDisplay from "./AnalyzerDisplay.svelte";
  import { Input } from "$lib/components/ui/input";
  import { onMount } from "svelte";
  import { actions } from "$lib/shortcuts.svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import { Slider } from "$lib/components/ui/slider";
  import { toggleMode } from "mode-watcher";
  import ScrollArea from "$lib/components/ui/scroll-area/scroll-area.svelte";
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
  <Dialog.Content class="w-[800px] p-0! px-0! py-0!">
    <ScrollArea class="max-h-[80vh] w-full">
      <Dialog.Header>
        <Dialog.Title
          class="flex flex-row justify-between px-6 pt-6 pr-12 text-xl"
        >
          <p>Настройки</p>
          <Button
            class="relative"
            onclick={toggleMode}
            variant="outline"
            size="icon"
          >
            <SunIcon
              class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 !transition-all dark:scale-0 dark:-rotate-90"
            />
            <MoonIcon
              class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 !transition-all dark:scale-100 dark:rotate-0"
            />
            <span class="sr-only">Toggle theme</span>
          </Button>
        </Dialog.Title>
        <Dialog.Description class="flex flex-col gap-4 p-6">
          <div class="flex flex-col gap-2">
            <div class="flex flex-row justify-between">
              <h1 class="text-foreground text-lg">Микрофон</h1>
              <Button
                variant={g.mic.monitoring ? "secondary" : "outline"}
                onclick={() => {
                  g.mic.monitoring = !g.mic.monitoring;
                  g.mic.connect();
                }}
              >
                Прослушать
              </Button>
            </div>

            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center space-x-2">
                <Switch
                  id="airplane-mode"
                  bind:checked={g.mic.noiseSuppression}
                />
                <Label for="airplane-mode">Шумоподавление</Label>
              </div>
              <div class="flex items-center space-x-2">
                <Switch
                  id="airplane-mode"
                  bind:checked={g.mic.echoCancellation}
                />
                <Label for="airplane-mode">Эхоподавление</Label>
              </div>
            </div>
            <h1>Усиление микрофона</h1>
            <GainSlider min={-12} bind:value={g.mic.gain} />
            <h1>Чувствительность</h1>
            <div
              class={`transition-[filter] duration-50 ${g.mic.speaking ? "" : "sepia-100"}`}
            >
              <AnalyzerDisplay rms={g.mic.rms} peak={g.mic.peak} />
            </div>
            <Slider
              type="single"
              bind:value={g.mic.gateThreshold}
              min={-54}
              max={0}
              step={0.1}
            />
            <h1>Выбор устройства</h1>
            <Select.Root
              type="single"
              onValueChange={(value) => {
                g.mic.deviceId = value;
                g.mic.connect();
              }}
            >
              <Select.Trigger
                class="w-full"
                onclick={() => {
                  g.mic.updateDevices();
                }}
              >
                {g.mic.devices.find(
                  (device) => device.deviceId === g.mic.deviceId,
                )?.label ?? "Не выбрано"}
              </Select.Trigger>
              <Select.Content>
                {#each g.mic.devices as device}
                  <Select.Item value={device.deviceId}
                    >{device.label}</Select.Item
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
                    <Tooltip.Content>
                      <div>{copied ? "Скопировано" : "Скопировать ссылку"}</div>
                    </Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </div>
            </div>
          </div>

          <div>
            <h1 class="text-foreground text-lg">Горячие клавиши</h1>
            {#each g.keys.bindings.entries() as [action, key] (action)}
              <div class="mb-2 flex flex-row items-center justify-between">
                <p class="text-muted-foreground text-base">{actions[action]}</p>
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
                      <Tooltip.Content>Нажмите, чтобы задать</Tooltip.Content>
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
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>
