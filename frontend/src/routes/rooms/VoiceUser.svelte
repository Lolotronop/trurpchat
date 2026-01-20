<script lang="ts">
  import type { ConnectedUser, VoiceChat } from "trurpchat-backend";
  import type { WebRTC } from "$lib/webrtc.svelte";
  import * as Avatar from "$lib/components/ui/avatar";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Button } from "$lib/components/ui/button";
  import { HeadphoneOff, MicOff, TvMinimalPlay } from "@lucide/svelte";

  type Props = {
    user: ConnectedUser;
    rtc: WebRTC | undefined;
    room: VoiceChat;
    mutedByMe: boolean;
    speaking: boolean;
  };

  const { user, rtc, room, speaking, mutedByMe }: Props = $props();
</script>

<div
  class="hover:bg-accent/50 over flex flex-row items-center justify-between gap-2 rounded p-1 select-none"
>
  <div class="flex flex-row items-center gap-2">
    <Avatar.Root
      class={`size-6 ${speaking ? "border-2 border-green-500" : ""}`}
    >
      <!-- <Avatar.Image src="https://github.com/shadcn.png" alt="@shadcn" /> -->
      <Avatar.Fallback class="text-xs select-none">
        {user.name[0].toUpperCase()}
      </Avatar.Fallback>
    </Avatar.Root>
    <p
      class={rtc?.room?.name === room.name
        ? ""
        : "text-muted-foreground"}
    >
      {user.name}
    </p>
  </div>
  <div class="flex h-6 flex-row items-center gap-2 pr-2">
    {#if user.muted || mutedByMe}
      <MicOff size={16} class={mutedByMe ? "text-yellow-600" : ""} />
    {/if}
    {#if user.deafened}
      <HeadphoneOff size={16} />
    {/if}
    {#if user.streaming}
      <Tooltip.Provider>
        <Tooltip.Root delayDuration={100}>
          <Tooltip.Trigger>
            <Button
              variant="ghost"
              class="hover:text-primary-foreground hover:bg-destructive! size-6"
              onclick={() => {
                if (!rtc) return;
                rtc.watching = user.id;
              }}
            >
              <TvMinimalPlay class="size-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Смотреть</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    {/if}
  </div>
</div>
