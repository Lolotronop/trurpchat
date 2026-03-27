<script lang="ts">
  import Stream from "$lib/components/stream/Stream.svelte";
  import { gitGud } from "$lib/god.svelte";
  import type { Server } from "$lib/servers.svelte";
  import VoiceUserCard from "./VoiceUserCard.svelte";

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  const g = gitGud();

  // TODO: this doesn't actually center the last row
  function optimizeGrid(el: HTMLDivElement) {
    const grid = el;
    const container = el.parentElement;
    const items = grid.children.length;
    if (!container) {
      return;
    }

    const containerWidth = container.clientWidth - 32;
    const containerHeight = container.clientHeight - 32;
    const gap = 8; // gap-8
    const aspectRatio = 16 / 9;

    let bestCols = 1;
    let bestSize = 0;

    // Try different column counts
    for (let cols = 1; cols <= items; cols++) {
      const rows = Math.ceil(items / cols);

      // Calculate max width per item
      const availableWidth = containerWidth - gap * (cols - 1);
      const maxWidthPerItem = availableWidth / cols;

      // Calculate max height per item
      const availableHeight = containerHeight - gap * (rows - 1);
      const maxHeightPerItem = availableHeight / rows;

      // Width constrained by height
      const widthFromHeight = maxHeightPerItem * aspectRatio;

      // Actual size is limited by the smaller constraint
      const actualWidth = Math.min(maxWidthPerItem, widthFromHeight);
      const actualHeight = actualWidth / aspectRatio;

      // Area is our optimization metric
      const area = actualWidth * actualHeight;

      if (area > bestSize) {
        bestSize = area;
        bestCols = cols;
      }
    }

    const bestRows = Math.ceil(items / bestCols);
    const itemWidth = (containerWidth - gap * (bestCols - 1)) / bestCols;
    const itemHeight = itemWidth / aspectRatio;

    // Check if height constrained
    const maxHeight = (containerHeight - gap * (bestRows - 1)) / bestRows;
    const finalHeight = Math.min(itemHeight, maxHeight);
    const finalWidth = finalHeight * aspectRatio;

    grid.style.gridTemplateColumns = `repeat(${bestCols}, ${finalWidth}px)`;
  }
</script>
<div
  class="grid gap-2 w-full content-center justify-items-center justify-center items-center p-2"
  {@attach function(el) {
        const observer = new ResizeObserver((entries) => {
          if (entries.length === 0) {
            return;
          }
          optimizeGrid(el);
        });
        observer.observe(el);
        }}
>
  {#each server.rtc?.room.users || [] as userId (userId)}
    {@const user = server.findUser(userId)}
    {#if user && "online" in user}
      {@const peer = server.rtc?.peers.get(user.id)}
      {#if user.id === server.user.id}
        <VoiceUserCard
          name={user.name}
          speaking={g.mic.speaking && !g.muted}
          muted={g.muted}
          deafened={g.deafened}
          camera={user.camera}
          cameraStream={g.camera.showMyVideo ? g.camera.stream : undefined}
        />
      {:else}
        <VoiceUserCard
          name={user.name}
          speaking={peer?.speaking || false}
          muted={peer?.mute || user.muted || false}
          deafened={user.deafened || false}
          camera={user.camera}
          cameraStream={peer?.cameraStream}
        />
      {/if}
      {#if user.streaming}
        <Stream {server} {user} />
      {/if}
    {/if}
  {/each}
</div>
