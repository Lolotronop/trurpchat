<script lang="ts">
  import type { Room } from "trurpchat-shared";
  import * as ButtonGroup from "$lib/components/ui/button-group";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";

  export type EditingRoom = Omit<
    Room,
    "id" | "order" | "nextMessageId" | "deletedAt"
  >;
  type Props = {
    initial?: EditingRoom;
    onsubmit: (room: EditingRoom) => void;
    oncalcel: () => void;
    allowTypeEdit?: boolean;
  };

  let { onsubmit, oncalcel, initial, allowTypeEdit = true }: Props = $props();

  const defaultRoom: EditingRoom = {
    name: "",
    type: "voice",
    visibilityMode: "inherit",
  };

  initial ??= defaultRoom;

  // svelte-ignore state_referenced_locally
  let room: EditingRoom = $state({ ...initial });
</script>

<form
  class="flex flex-col gap-4 w-full"
  onsubmit={(e) => {
    e.preventDefault();
    onsubmit(room);
    room = initial ?? defaultRoom;
  }}
>
  {#if allowTypeEdit}
    <div class="flex flex-row gap-8">
      <Label for="type">Тип</Label>
      <ButtonGroup.Root id="type" class="w-full">
        <ToggleGroup.Root type="single" variant="outline" bind:value={room.type}>
          <ToggleGroup.Item value="voice" class="text-sm">
            Голосовая
          </ToggleGroup.Item>
          <ToggleGroup.Item value="text" class="text-sm">
            Текстовая
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </ButtonGroup.Root>
    </div>
  {/if}
  <div class="flex flex-col gap-2">
    <Label for="name">Название</Label>
    <Input id="name" placeholder="Название комнаты" bind:value={room.name} />
  </div>

  <div class="flex items-center justify-between gap-2">
    <Label>Приватная</Label>
    <Switch
      checked={room.visibilityMode === "private"}
      onclick={() => {
        room.visibilityMode = room.visibilityMode === "private" ? "inherit" : "private";
      }}
    />
  </div>

  <div class="flex flex-row gap-2 w-full justify-between">
    <Button
      type="button"
      variant="secondary"
      onclick={() => {
      oncalcel();
      room = initial ?? defaultRoom;
    }}
    >
      Отмена
    </Button>
    <Button type="submit">Сохранить</Button>
  </div>
</form>
