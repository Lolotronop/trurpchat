<script lang="ts">
  import Avatar from "$lib/components/Avatar.svelte";
  import { Camera, HeadphoneOff, MicOff } from "@lucide/svelte";

  type Props = {
    name: string;
    muted: boolean;
    deafened: boolean;
    speaking: boolean;
    camera: boolean;
    cameraStream?: MediaStream;
    shouldHideInfo?: boolean;
  };
  const {
    name,
    muted,
    deafened,
    speaking,
    camera,
    cameraStream,
    shouldHideInfo = false,
  }: Props =
    $props();

  function attachCamera(el: HTMLVideoElement) {
    if (!cameraStream) {
      return;
    }
    el.srcObject = cameraStream;
  }
</script>

<div
  class="aspect-video flex w-full justify-center items-center rounded-md relative {camera && cameraStream ? "bg-black" : "bg-accent"} {speaking ? "outline outline-green-500" : ""}"
>
  {#if camera && cameraStream !== undefined}
    <video class="w-full h-full object-fit" {@attach attachCamera} autoplay muted></video>
  {:else}
    <Avatar name={name} class="size-8"></Avatar>
  {/if}
  {#if !shouldHideInfo}
    <div class="absolute bottom-0 flex w-full justify-between p-2">
      <div class="flex items-center gap-2 bg-background rounded-md p-2">
        <p class="text-foreground text-sm">{name}</p>
        {#if muted}
          <MicOff class="size-4" />
        {/if}
        {#if deafened}
          <HeadphoneOff class="size-4" />
        {/if}
        {#if camera}
          <Camera class="size-4" />
        {/if}
      </div>
    </div>
  {/if}
</div>
