<script lang="ts">
  import type { Message, User } from "trurpchat-backend";
  import Avatar from "$lib/components/Avatar.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";

  type Props = {
    user: User;
    message: Message;
  };

  const { user, message }: Props = $props();

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    if (isToday) {
      return time;
    }

    const dateStr = date.toLocaleDateString([], {
      day: "2-digit",
      month: "2-digit",
    });

    return `${time} ${dateStr}`;
  }

  function formatFullDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString([], {
      dateStyle: "full",
      timeStyle: "short",
    });
  }
</script>

<div class="flex gap-3 px-2 py-1 hover:bg-accent/50">
  <Avatar name={user.name} class="mt-1 size-9 shrink-0" />
  <div class="flex flex-col min-w-0">
    <div class="flex items-baseline gap-2">
      <p class="font-medium text-sm text-foreground">{user.name}</p>
      <Tooltip.Root>
        <Tooltip.Trigger class="text-xs text-muted-foreground cursor-default">
          {formatTime(message.createdAt)}
        </Tooltip.Trigger>
        <Tooltip.Content sideOffset={4}>
          {formatFullDate(message.createdAt)}
        </Tooltip.Content>
      </Tooltip.Root>
    </div>
    <p class="text-sm text-foreground break-words whitespace-pre-wrap">
      {message.text}
    </p>
  </div>
</div>
