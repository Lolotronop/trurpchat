<script lang="ts">
  import Avatar from "$lib/components/Avatar.svelte";
  import SpeakingBorder from "$lib/components/SpeakingBorder.svelte";
  import { Camera, HeadphoneOff, MicOff } from "@lucide/svelte";
  import type { ConnectedUser } from "trurpchat-backend";

  type Props = {
    user: ConnectedUser;
    mutedByMe?: boolean;
    speaking: boolean;
    cameraStream?: MediaStream;
    shouldHideInfo?: boolean;
    edgeToEdge?: boolean;
  };
  const {
    user,
    speaking,
    mutedByMe,
    cameraStream,
    shouldHideInfo = false,
    edgeToEdge = false,
  }: Props = $props();

  const { name, muted, deafened, camera } = $derived(user);

  function attachCamera(el: HTMLVideoElement) {
    if (!cameraStream) {
      return;
    }
    el.srcObject = cameraStream;
  }
</script>

<SpeakingBorder
  {speaking}
  rounded={!edgeToEdge}
  class="aspect-video flex w-full justify-center items-center overflow-hidden {edgeToEdge ? 'rounded-none' : 'rounded-md'} {camera && cameraStream ? 'bg-black' : 'bg-accent'}"
>
  {#if camera && cameraStream !== undefined}
    <video
      id="user-{user.id}-camera"
      class="w-full h-full object-fit {edgeToEdge ? 'rounded-none' : 'rounded-md'}"
      {@attach attachCamera}
      autoplay
      muted
    ></video>
  {:else}
    <Avatar {name} class="size-8 shrink-0 rounded-full"></Avatar>
  {/if}
  <div class="absolute bottom-0 flex w-full justify-between p-2">
    <div
      class="flex items-center gap-2 bg-background rounded-md p-0 min-w-0 min-h-0 has-first:p-2"
    >
      {#if muted || mutedByMe}
        <MicOff
          class="size-4 m-0.5 {mutedByMe ? 'text-yellow-600' : 'text-destructive'}"
        />
      {/if}
      {#if deafened}
        <HeadphoneOff class="size-4 m-0.5 text-destructive" />
      {/if}
      {#if camera}
        <Camera class="size-4 m-0.5" />
      {/if}
      {#if !shouldHideInfo}
        <p class="text-foreground text-sm">{name}</p>
      {/if}
    </div>
  </div>
</SpeakingBorder>
