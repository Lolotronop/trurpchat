<script lang="ts">
  import { Label } from "$lib/components/ui/label";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";

  import type { StreamSettings } from "$lib/stream-settings.svelte";

  type Props = {
    settings: StreamSettings;
  };

  const { settings = $bindable() }: Props = $props();
</script>

<div class="flex flex-row items-center justify-between gap-2">
  <Label>Разрешение</Label>
  <ToggleGroup.Root
    type="single"
    variant="outline"
    bind:value={() => settings.height.toString(),
      (v) => {
        if (!v) return;
        settings.height = parseInt(v, 10);
      }}
  >
    <ToggleGroup.Item value="720" class="text-sm">720p</ToggleGroup.Item>
    <ToggleGroup.Item value="1080" class="text-sm">1080p</ToggleGroup.Item>
  </ToggleGroup.Root>
</div>
<Separator />
<div class="flex flex-row items-center justify-between gap-2">
  <Label>FPS</Label>
  <ToggleGroup.Root
    type="single"
    variant="outline"
    bind:value={() => settings.fps.toString(),
      (v) => {
        if (!v) return;
        settings.fps = parseInt(v, 10);
      }}
  >
    <ToggleGroup.Item value="24" class="text-sm">24</ToggleGroup.Item>
    <ToggleGroup.Item value="30" class="text-sm">30</ToggleGroup.Item>
    <ToggleGroup.Item value="60" class="text-sm">60</ToggleGroup.Item>
  </ToggleGroup.Root>
</div>
<Separator />
<div class="flex flex-row items-center justify-between gap-2">
  <Label>Пресет</Label>
  <ToggleGroup.Root
    type="single"
    variant="outline"
    bind:value={() => settings.presetNum.toString(),
      (v) => {
        if (!v) return;
        settings.presetNum = parseInt(v, 10);
      }}
  >
    <ToggleGroup.Item value="2" class="text-sm">Скорость</ToggleGroup.Item>
    <ToggleGroup.Item value="1" class="text-sm">Баланс</ToggleGroup.Item>
    <ToggleGroup.Item value="0" class="text-sm">Качество</ToggleGroup.Item>
  </ToggleGroup.Root>
</div>
<Separator />
<div class="flex flex-row items-center justify-between gap-2">
  <Label>Битрейт</Label>
  <ToggleGroup.Root
    type="single"
    variant="outline"
    bind:value={() => (settings.videoBitrate / 1000).toString(),
      (v) => {
        if (!v) return;
        settings.videoBitrate = parseInt(v, 10) * 1000;
      }}
  >
    <ToggleGroup.Item value="2000" class="text-sm">2000</ToggleGroup.Item>
    <ToggleGroup.Item value="4000" class="text-sm">4000</ToggleGroup.Item>
    <ToggleGroup.Item value="6000" class="text-sm">6000</ToggleGroup.Item>
    <ToggleGroup.Item value="8000" class="text-sm">8000</ToggleGroup.Item>
  </ToggleGroup.Root>
</div>
<Separator />
<div class="flex flex-row items-center justify-between gap-2">
  <Label class="w-full" for="hw-accell">Аппаратное ускорение</Label>
  <Switch id="hw-accell" bind:checked={settings.useHwAccel} />
</div>
