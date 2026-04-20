<script lang="ts">
  import type { TextMessage, User } from "trurpchat-backend";
  import { mentions } from "trurpchat-shared";
  import Avatar from "$lib/components/Avatar.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { username } from "$lib/utils.svelte";
  import type { UserStore } from "$lib/users.svelte";

  type Props = {
    user?: User;
    message: TextMessage;
    showHeader?: boolean;
    currentUserId?: number;
    users: UserStore;
  };

  let { user, message, showHeader, currentUserId, users }: Props = $props();
  showHeader ??= true;

  const mentionParts = $derived(
    message.hasMention ? mentions.user.split(message.text) : null,
  );
  const mentionsCurrentUser = $derived(
    message.hasMention &&
      currentUserId !== undefined &&
      mentions.user.includes(message.text, currentUserId),
  );

  function getMentionLabel(userId: number) {
    const mentionUser = users.find(userId);
    return mentions.user.format.name(mentionUser ?? userId);
  }

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

<div
  class={[
    "flex gap-3 px-2 py-1 hover:bg-accent/20 transition-colors msg",
    mentionsCurrentUser && "bg-accent/20",
  ]}
>
  <div class="w-9 flex justify-center">
    {#if showHeader}
      <Avatar name={user ? username(user) : "?"} class="mt-1 shrink-0 size-9" />
    {:else}
      <div
        class="time transition-opacity opacity-0 flex items-start select-none"
      >
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
          {user ? username(user) : "Deleted"}
        </p>
        <Tooltip.Root>
          <Tooltip.Trigger class="text-xs text-muted-foreground cursor-default">
            {formatTime(message.createdAt, false)}
            {message.id}
          </Tooltip.Trigger>
          <Tooltip.Content sideOffset={4}>
            {formatFullDate(message.createdAt)}
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
    {/if}
    <p class="text-sm text-foreground wrap-break-word whitespace-pre-wrap">
      {#if mentionParts}
        {#each mentionParts as part, index (`${part.type}:${index}:${part.type === "text" ? part.value : part.raw}`)}
          {#if part.type === "text"}
            {part.value}
          {:else}
            <span class="text-foreground font-medium">
              {getMentionLabel(part.userId)}
            </span>
          {/if}
        {/each}
      {:else}
        {message.text}
      {/if}
    </p>
  </div>
</div>

<style>
  .msg:hover * > .time {
    opacity: 1;
  }
</style>
