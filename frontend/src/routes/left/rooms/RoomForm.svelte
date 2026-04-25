<script lang="ts">
  import type { RoomData } from "trurpchat-backend";
  import * as ButtonGroup from "$lib/components/ui/button-group";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";

  export type EditingRoom = Omit<
    RoomData,
    "id" | "order" | "nextMessageId" | "deletedAt"
  >;
  type Props = {
    initial?: EditingRoom;
    onsubmit: (room: EditingRoom) => void;
    oncalcel: () => void;
  };

  let { onsubmit, oncalcel, initial }: Props = $props();

  initial ??= {
    name: "",
    type: "voice",
  };

  // svelte-ignore state_referenced_locally
  let room: EditingRoom = $state({ ...initial });
</script>

<form
  class="flex flex-col gap-4 w-full"
  onsubmit={(e) => {
    e.preventDefault();
    onsubmit(room);
    room = initial;
  }}
>
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
  <div class="flex flex-col gap-2">
    <Label for="name">Название</Label>
    <Input id="name" placeholder="Название комнаты" bind:value={room.name} />
  </div>

  <div class="flex flex-row gap-2 w-full justify-between">
    <Button
      type="button"
      variant="secondary"
      onclick={() => {
      oncalcel();
      room = initial;
    }}
    >
      Отмена
    </Button>
    <Button type="submit">Сохранить</Button>
  </div>
</form>
