<script lang="ts">
  import { Pencil } from "@lucide/svelte";
  import type { TextMessage } from "trurpchat-shared";
  import { mentions } from "trurpchat-shared";
  import Avatar from "$lib/components/Avatar.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import type { UserStore, UserWithRoles } from "$lib/users.svelte";

  type Props = {
    user?: UserWithRoles;
    message: TextMessage;
    showHeader?: boolean;
    currentUserId?: number;
    users: UserStore;
    replyToMessage?: TextMessage;
    highlighted?: boolean;
    onReplyClick?: (messageId: number) => void;
  };

  let {
    user,
    message,
    showHeader,
    currentUserId,
    users,
    replyToMessage,
    highlighted,
    onReplyClick,
  }: Props = $props();
  showHeader ??= true;

  const mentionParts = $derived(
    message.hasMention ? mentions.split(message.text) : null,
  );
  const replyToUser = $derived(
    replyToMessage ? users.find(replyToMessage.userId) : undefined,
  );

  const mentionsCurrentUser = $derived.by(() => {
    if (!message.hasMention || currentUserId === undefined) {
      return false;
    }

    if (mentions.user.includes(message.text, currentUserId)) {
      return true;
    }

    const currentUser = users.find(currentUserId);
    if (!currentUser) {
      return false;
    }

    return currentUser.roles.some((role) =>
      mentions.role.includes(message.text, role.id),
    );
  });

  function getMentionLabel(userId: number) {
    const mentionUser = users.find(userId);
    return mentions.user.format.name(mentionUser ?? userId);
  }

  function getRoleMentionLabel(roleId: number) {
    const role = users.findRole(roleId);
    return mentions.role.format.name(role ?? roleId);
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

  function replyPreviewText(reply: TextMessage | undefined): string {
    if (!reply) {
      return "Загрузка сообщения...";
    }

    if (reply.deletedAt !== null) {
      return "Удалённое сообщение";
    }

    return reply.text;
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
    "relative flex gap-3 px-2 py-1 hover:bg-accent/20 msg rounded-sm",
    mentionsCurrentUser && "bg-accent/20",
  ]}
>
  <div
    class={[
      "pointer-events-none absolute inset-0 bg-accent/20 transition-opacity duration-500 z-[-1]",
      highlighted ? "opacity-100 duration-0" : "opacity-0",
    ]}
  ></div>
  {#if message.replyTo && showHeader}
    <svg
      class="pointer-events-none absolute left-2 top-1 h-10 w-16 overflow-visible text-muted/70"
      aria-hidden="true"
    >
      <path
        d="M 18 32 V 10 H 64"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  {/if}
  <div class="w-9 flex flex-col items-center">
    {#if showHeader}
      {#if message.replyTo}
        <div class="mb-1 h-5 shrink-0"></div>
      {/if}
      <Avatar name={user ? user.username : "?"} class="mt-1 shrink-0 size-9" />
    {:else}
      <div class="relative flex items-start justify-center select-none">
        {#if message.edited}
          <div class="edited-indicator">
            <Tooltip.Root>
              <Tooltip.Trigger
                class="text-muted-foreground cursor-default"
                aria-label="Изменено"
              >
                <Pencil class="size-3" />
              </Tooltip.Trigger>
              <Tooltip.Content sideOffset={4}>Изменено</Tooltip.Content>
            </Tooltip.Root>
          </div>
        {/if}
        <div class="time opacity-0 absolute flex items-start">
          <Tooltip.Root>
            <Tooltip.Trigger
              class="text-xs text-muted-foreground cursor-default"
            >
              {formatTime(message.createdAt, false)}
            </Tooltip.Trigger>
            <Tooltip.Content sideOffset={4}>
              {formatFullDate(message.createdAt)}
            </Tooltip.Content>
          </Tooltip.Root>
        </div>
      </div>
    {/if}
  </div>
  <div class="flex flex-col min-w-0">
    {#if message.replyTo}
      <button
        type="button"
        class="mb-1 flex max-w-full cursor-pointer items-center gap-2 rounded-sm py-0.5 pr-2 text-left text-xs text-muted-foreground hover:text-foreground"
        onclick={() => {
          if (message.replyTo) {
            onReplyClick?.(message.replyTo);
          }
        }}
      >
        {#if replyToMessage}
          <Avatar
            name={replyToUser ? replyToUser.username : "?"}
            class="size-4 shrink-0"
          />
        {:else}
          <div class="size-4 shrink-0 rounded-full bg-muted"></div>
        {/if}
        <span
          class="shrink-0 font-medium text-foreground"
          style:color={replyToUser?.colorHex}
        >
          {replyToUser
            ? replyToUser.username
            : replyToMessage
              ? "Deleted"
              : "..."}
        </span>
        <span class="min-w-0 truncate">{replyPreviewText(replyToMessage)}</span>
      </button>
    {/if}
    {#if showHeader}
      <div class="flex items-baseline gap-2">
        <p
          class="font-medium text-sm text-foreground"
          style:color={user?.colorHex}
        >
          {user ? user.username : "Deleted"}
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
        {#if message.edited}
          <Tooltip.Root>
            <Tooltip.Trigger
              class="text-muted-foreground cursor-default"
              aria-label="Изменено"
            >
              <Pencil class="size-3" />
            </Tooltip.Trigger>
            <Tooltip.Content sideOffset={4}>Изменено</Tooltip.Content>
          </Tooltip.Root>
        {/if}
      </div>
    {/if}
    <p class="text-sm text-foreground wrap-break-word whitespace-pre-wrap">
      {#if mentionParts}
        {#each mentionParts as part, index (`${part.type}:${index}:${part.type === "text" ? part.value : part.raw}`)}
          {#if part.type === "text"}
            {part.value}
          {:else if part.type === "user"}
            {@const mentionUser = users.find(part.userId)}
            <span
              class="text-foreground font-medium"
              style:color={mentionUser?.colorHex}
            >
              {getMentionLabel(part.userId)}
            </span>
          {:else}
            {@const mentionRole = users.findRole(part.roleId)}
            <span
              class="text-foreground font-medium"
              style:color={mentionRole?.colorHex}
            >
              {getRoleMentionLabel(part.roleId)}
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

  .msg:hover .edited-indicator {
    opacity: 0;
  }
</style>
