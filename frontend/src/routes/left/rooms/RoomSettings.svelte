<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select/index.js";
  import type { RoomNotificationMode, RoomWithData } from "$lib/rooms.svelte";
  import type { Server } from "$lib/servers.svelte";

  type Props = {
    open?: boolean;
    server: Server;
    room: RoomWithData;
  };

  let { open = $bindable(false), server, room }: Props = $props();

  const notificationItems: {
    value: RoomNotificationMode;
    label: string;
    description: string;
  }[] = [
    {
      value: "normal",
      label: "Обычные",
      description: "Получать уведомления о упомянаниях",
    },
    {
      value: "suppressed",
      label: "Подавленные",
      description:
        "Без звука и системных уведомлений, но с индикаторами непрочитанного",
    },
    {
      value: "muted",
      label: "Выключенные",
      description: "Серый в списке и без индикаторов непрочитанного",
    },
  ];

  const colorInputValue = $derived(room.colorHex ?? "#ffffff");

  function setNotificationMode(value: string) {
    if (value !== "normal" && value !== "suppressed" && value !== "muted") {
      return;
    }

    server.rooms.setData(room.id, {
      notificationMode: value,
    });
  }

  function setColorHex(value: string) {
    server.rooms.setData(room.id, {
      colorHex: value,
    });
  }

  function clearColorHex() {
    server.rooms.setData(room.id, {
      colorHex: undefined,
    });
  }

  function resetAll() {
    server.rooms.deleteData(room.id);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-xl">
    <Dialog.Header>
      <Dialog.Title class="text-xl">Настройки комнаты</Dialog.Title>
      <Dialog.Description>
        Локальные настройки для комнаты
        <span class="font-medium">{room.name}</span>
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-6 py-2">
      {#if room.type === "text"}
        <div class="flex flex-col gap-2">
          <Label>Уведомления</Label>
          <Select.Root
            type="single"
            value={room.notificationMode}
            onValueChange={(value) => {
            setNotificationMode(value);
          }}
          >
            <Select.Trigger class="w-full">
              {notificationItems.find((item) => item.value === room.notificationMode)
              ?.label ?? "Обычные"}
            </Select.Trigger>
            <Select.Content>
              {#each notificationItems as item (item.value)}
                <Select.Item value={item.value} label={item.label}>
                  <div class="flex flex-col gap-0.5">
                    <span>{item.label}</span>
                    <span class="text-muted-foreground text-xs">
                      {item.description}
                    </span>
                  </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <p class="text-muted-foreground text-sm">
            {notificationItems.find((item) => item.value === room.notificationMode)
            ?.description}
          </p>
        </div>
      {/if}

      <div class="flex flex-col gap-3">
        <Label for={`room-color-${room.id}`}>Цвет комнаты</Label>
        <div class="flex items-center gap-3">
          <input
            id={`room-color-${room.id}`}
            type="color"
            class="border-input bg-background h-10 w-14 rounded-md border p-1"
            value={colorInputValue}
            oninput={(event) => {
              setColorHex(event.currentTarget.value);
            }}
          >
          <div class="flex min-w-0 flex-1 flex-col">
            <p class="text-sm">{room.colorHex ?? "Не задан"}</p>
            <p class="text-muted-foreground text-xs">
              Используется только на этом устройстве
            </p>
          </div>
          <Button variant="outline" onclick={clearColorHex}>Сбросить</Button>
        </div>
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={resetAll}>Сбросить всё</Button>
      <Button onclick={() => (open = false)}>Закрыть</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
