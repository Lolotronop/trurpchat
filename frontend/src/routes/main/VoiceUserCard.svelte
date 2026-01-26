<script lang="ts">
  import Avatar from "$lib/components/Avatar.svelte";
  import { HeadphoneOff, MicOff } from "@lucide/svelte";

  type Props = {
    name: string;
    muted: boolean;
    deafened: boolean;
    speaking: boolean;
  };
  const { name, muted, deafened, speaking }: Props = $props();
</script>

<div
  class="aspect-video flex w-full justify-center items-center rounded-md bg-accent relative {speaking ? "outline outline-green-500" : ""}"
>
  <Avatar name={name} class="size-8"></Avatar>
  <div class="absolute bottom-0 flex w-full justify-between p-2">
    <div class="flex items-center gap-2 bg-background rounded-md p-2">
      <p class="text-foreground text-sm">{name}</p>
      {#if muted}
        <MicOff class="size-4" />
      {/if}
      {#if deafened}
        <HeadphoneOff class="size-4" />
      {/if}
    </div>
  </div>
</div>
