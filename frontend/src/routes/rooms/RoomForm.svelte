<script lang="ts">
  import type { RoomData } from "trurpchat-backend";
  import * as ButtonGroup from "$lib/components/ui/button-group";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";

  type EditingRoom = Omit<RoomData, "id">;
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
      <Button
        type="button"
        variant="secondary"
        onclick={() => room.type = "voice"}
      >
        Голосовая
      </Button>
      <Button type="button" disabled variant="outline">Текстовая</Button>
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
