<script lang="ts">
  import type { Room } from "trurpchat-shared";
  import * as ButtonGroup from "$lib/components/ui/button-group";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import EditableTextField from "$lib/components/EditableTextField.svelte";
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
    <div class="flex w-full flex-row justify-between gap-2">
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

    <div class="flex flex-row gap-8">
      <Label for="type">Тип</Label>
      <ButtonGroup.Root id="type" class="w-full">
        <ToggleGroup.Root
          type="single"
          variant="outline"
          bind:value={room.type}
        >
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
  {#if allowTypeEdit}
    <div class="flex flex-col gap-2">
      <Label for="name">Название</Label>
      <Input id="name" placeholder="Название комнаты" bind:value={room.name} />
    </div>
  {:else}
    <EditableTextField
      label="Название"
      value={room.name}
      placeholder="Название комнаты"
      onSave={(value) => {
        const name = value?.trim();
        if (!name || name.length < 3 || name.length > 50) return false;
        room.name = name;
        onsubmit(room);
        return true;
      }}
    />
  {/if}

  <div class="flex items-center justify-between gap-2">
    <Label class="w-full" for="private">Приватная</Label>
    <Switch
      id="private"
      checked={room.visibilityMode === "private"}
      onCheckedChange={() => {
        room.visibilityMode = room.visibilityMode === "private" ? "inherit" : "private";
        onsubmit(room);
      }}
    />
  </div>
</form>
