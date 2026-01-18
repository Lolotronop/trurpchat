<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { gitGud } from "$lib/god.svelte";
  import { MoonIcon, Settings, SunIcon, X } from "@lucide/svelte";
  import GainSlider from "$lib/components/GainSlider.svelte";
  import AnalyzerDisplay from "$lib/components/AnalyzerDisplay.svelte";
  import { actions } from "$lib/shortcuts.svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import { Slider } from "$lib/components/ui/slider";
  import { toggleMode } from "mode-watcher";
  import ScrollArea from "$lib/components/ui/scroll-area/scroll-area.svelte";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";
  import { mode } from "mode-watcher";
  import { themes } from "$lib/theme.svelte";

  const g = gitGud();
  g.mic.connect();

  // TODO: redo this with the selected server context

  let copied = $state(false);
  $effect(() => {
    if (copied) {
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  });
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
      <Settings class="size-5" />
    </Button>
  </Dialog.Trigger>
  <Dialog.Content class=" max-w-2xl p-0! px-0! py-0!">
    <ScrollArea class="max-h-[80vh] w-full">
      <Dialog.Header>
        <Dialog.Title
          class="mb-3 flex flex-row justify-between px-6 pt-6 text-xl"
        >
          <p>Настройки</p>
        </Dialog.Title>
        <Dialog.Description class="flex flex-col gap-8 px-6 pb-6">
          <div class="flex flex-col gap-2">
            <h1 class="text-foreground text-lg">Микрофон</h1>
            <div class="flex w-full flex-col gap-6">
              <div class="flex flex-col gap-2">
                <Button
                  variant={g.mic.monitoring ? "secondary" : "outline"}
                  onclick={() => {
                    g.mic.monitoring = !g.mic.monitoring;
                    g.mic.connect();
                  }}
                >
                  Прослушать
                </Button>
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
                      <Select.Item value={device.deviceId}>
                        {device.label}
                      </Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>

                <div class="flex flex-col gap-4">
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
              </div>

              <div class="flex flex-col gap-2">
                <h1>Усиление микрофона</h1>
                <GainSlider min={-12} bind:value={g.mic.gain} />
              </div>

              <div class="flex flex-col gap-2">
                <h1>Чувствительность</h1>
                <Slider
                  type="single"
                  bind:value={g.mic.gateThreshold}
                  min={-42}
                  max={0}
                  step={0.1}
                />
                <div
                  class={`transition-[filter] duration-50 ${g.mic.speaking ? "" : "saturate-0"}`}
                >
                  <AnalyzerDisplay rms={g.mic.rms} peak={g.mic.peak} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h1 class="text-foreground text-lg">Горячие клавиши</h1>
            <div class="flex flex-col gap-2">
              {#each g.keys.bindings.entries() as [action, key] (action)}
                <div class="flex flex-row items-center justify-between">
                  <p class="text-muted-foreground text-base">
                    {actions[action]}
                  </p>
                  <div class="flex flex-row items-center justify-between gap-2">
                    <Tooltip.Provider>
                      <Tooltip.Root disableHoverableContent={true}>
                        <Tooltip.Trigger
                          class="flex flex-row items-center justify-between"
                        >
                          <Button
                            variant="secondary"
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
          </div>

          <div class="flex flex-col">
            <h1 class="text-foreground text-lg">Тема</h1>

            <div class="flex flex-col gap-2">
              <div class="flex w-full flex-row justify-between">
                <div class="flex flex-row gap-2">
                  <Button
                    onclick={toggleMode}
                    variant={mode.current === "light" ? "secondary" : "outline"}
                  >
                    Светлая
                    <SunIcon class="" />
                  </Button>

                  <Button
                    onclick={toggleMode}
                    variant={mode.current === "dark" ? "secondary" : "outline"}
                  >
                    Темная
                    <MoonIcon />
                  </Button>
                </div>

                <div class="flex flex-row gap-2">
                  {#each Object.keys(themes) as theme (theme)}
                    <Button
                      variant={g.theme.selected === theme
                        ? "secondary"
                        : "outline"}
                      onclick={() => {
                        // @ts-ignore
                        g.theme.selected = theme;
                      }}
                    >
                      {theme}
                    </Button>
                  {/each}

                  <Tooltip.Provider>
                    <Tooltip.Root delayDuration={200}>
                      <Tooltip.Trigger
                        class="flex flex-row items-center justify-between"
                      >
                        <Button
                          variant={g.theme.selected === "custom"
                            ? "secondary"
                            : "outline"}
                          onclick={() => (g.theme.selected = "custom")}
                        >
                          Кастомная
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        <a
                          href="https://tweakcn.com/editor/theme"
                          target="_blank"
                        >
                          Конфигуратор
                        </a>
                      </Tooltip.Content>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                </div>
              </div>

              {#if g.theme.selected === "custom"}
                <Textarea class="max-h-48" bind:value={g.theme.customCss} />
              {/if}
            </div>
          </div>
        </Dialog.Description>
      </Dialog.Header>
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>
