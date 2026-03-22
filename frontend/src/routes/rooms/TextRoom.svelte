<script lang="ts">
  import { Hash } from "@lucide/svelte";
  import type { Room } from "trurpchat-backend";
  import { Button } from "$lib/components/ui/button";
  import type { Server } from "$lib/servers.svelte";
  import RoomContextMenu from "./RoomContextMenu.svelte";

  type Props = {
    room: Extract<Room, { type: "text" }>;
    server: Server;
  };

  const { room, server }: Props = $props();
</script>

<RoomContextMenu {room} {server}>
  <Button
    variant="ghost"
    class="hover:text-foreground! flex w-full flex-row items-center justify-start text-base font-normal"
  >
    <div class="flex flex-row items-center gap-2">
      <Hash size={16} strokeWidth={3} />
      <p>{room.name}</p>
    </div>
  </Button>
</RoomContextMenu>
