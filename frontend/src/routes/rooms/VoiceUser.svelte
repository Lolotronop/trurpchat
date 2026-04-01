<script lang="ts">
  import { Camera, HeadphoneOff, MicOff, TvMinimalPlay } from "@lucide/svelte";
  import type { ConnectedUser, VoiceChat } from "trurpchat-backend";
  import Avatar from "$lib/components/Avatar.svelte";
  import type { WebRTC } from "$lib/webrtc.svelte";

  type Props = {
    user: ConnectedUser;
    rtc: WebRTC;
    room: VoiceChat;
    mutedByMe: boolean;
    speaking: boolean;
  };

  const { user, rtc, room, speaking, mutedByMe }: Props = $props();
</script>

<div
  class="hover:bg-accent/50 flex flex-row items-center justify-between gap-2 rounded p-1 select-none"
>
  <div class="flex flex-row items-center gap-2 min-w-0">
    <Avatar
      class="size-6 shrink-0 {speaking ? "border-2 border-green-500" : ""}"
      name={user.name}
    ></Avatar>
    <p class="truncate flex-1 {rtc?.room?.id === room.id ? "" : "text-muted-foreground"}">
      {user.name}
    </p>
  </div>
  <div class="flex h-6 flex-row shrink-0 items-center gap-2 pr-2">
    {#if user.muted || mutedByMe}
      <MicOff class={`size-4 ${mutedByMe ? "text-yellow-600" : ""}`} />
    {/if}
    {#if user.deafened}
      <HeadphoneOff class="size-4" />
    {/if}
    {#if user.camera}
      <Camera class="size-4" />
    {/if}
    {#if user.streaming}
      <TvMinimalPlay class="size-4" />
    {/if}
  </div>
</div>
