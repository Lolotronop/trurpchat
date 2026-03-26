<script lang="ts">
  import type { TextMessage, User } from "trurpchat-backend";
  import Avatar from "$lib/components/Avatar.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";

  type Props = {
    user?: User;
    message: TextMessage;
    showHeader?: boolean;
  };

  let { user, message, showHeader }: Props = $props();
  showHeader ??= true;

  function formatTime(date: Date, showDate = true): string {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    if (!showDate || isToday) {
      return time;
    }

    const dateStr = date.toLocaleDateString([], {
      day: "2-digit",
      month: "2-digit",
    });

    return `${time} ${dateStr}`;
  }

  function formatFullDate(date: Date): string {
    return date.toLocaleString([], {
      dateStyle: "full",
      timeStyle: "short",
    });
  }
</script>

<div class="flex gap-3 px-2 py-1 hover:bg-accent/20 transition-colors msg">
  <div class="w-9 flex">
    {#if showHeader}
      <Avatar name={user?.name ?? "?"} class="mt-1 shrink-0 size-9" />
    {:else}
      <div style="opacity: 0" class="time transition-opacity">
        <Tooltip.Root>
          <Tooltip.Trigger class="text-xs text-muted-foreground cursor-default">
            {formatTime(message.createdAt, false)}
          </Tooltip.Trigger>
          <Tooltip.Content sideOffset={4}>
            {formatFullDate(message.createdAt)}
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
    {/if}
  </div>
  <div class="flex flex-col min-w-0">
    {#if showHeader}
      <div class="flex items-baseline gap-2">
        <p class="font-medium text-sm text-foreground">
          {user?.name ?? "Deleted"}
        </p>
        <Tooltip.Root>
          <Tooltip.Trigger class="text-xs text-muted-foreground cursor-default">
            {formatTime(message.createdAt, false)}
          </Tooltip.Trigger>
          <Tooltip.Content sideOffset={4}>
            {formatFullDate(message.createdAt)}
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
    {/if}
    <p class="text-sm text-foreground wrap-break-word whitespace-pre-wrap">
      {message.text}
    </p>
  </div>
</div>

<style>
  .msg:hover * > .time {
    opacity: 1 !important;
  }
</style>
