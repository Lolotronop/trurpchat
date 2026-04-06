<script lang="ts">
  import type { ConnectedUser } from "trurpchat-backend";
  import Stream from "$lib/components/stream/Stream.svelte";
  import { OvenPlayerController } from "$lib/components/stream/ovenplayer.svelte";
  import { Button } from "$lib/components/ui/button";
  import { gitGud } from "$lib/god.svelte";
  import type { Server } from "$lib/servers.svelte";
  import VoiceUserCard from "./VoiceUserCard.svelte";

  type Props = {
    server: Server;
  };

  type Tile = {
    id: string;
    kind: "user" | "stream";
    userId: number;
  };

  const { server }: Props = $props();

  const g = gitGud();

  const GAP = 8;
  const CONTAINER_PADDING = 16;
  const ASPECT_RATIO = 16 / 9;

  const roomUsers = $derived.by(() => {
    const userIds = server.rtc.room?.users ?? [];

    return userIds
      .map((userId) => server.findUser(userId))
      .filter((user): user is ConnectedUser => user?.online === true);
  });

  const tiles = $derived.by(() => {
    const nextTiles: Tile[] = [];

    for (const user of roomUsers) {
      nextTiles.push({
        id: `user:${user.id}`,
        kind: "user",
        userId: user.id,
      });

      if (user.streaming) {
        nextTiles.push({
          id: `stream:${user.id}`,
          kind: "stream",
          userId: user.id,
        });
      }
    }

    return nextTiles;
  });

  let layoutMode = $state<"grid" | "focus">("grid");
  let focusedTileId = $state<string | undefined>(undefined);
  let hideOthers = $state(false);

  const focusedTile = $derived(tiles.find((tile) => tile.id === focusedTileId));
  const secondaryTiles = $derived(
    focusedTileId ? tiles.filter((tile) => tile.id !== focusedTileId) : [],
  );

  let gridContainer: HTMLDivElement | undefined = $state(undefined);
  let secondaryContainer: HTMLDivElement | undefined = $state(undefined);
  let focusContainer: HTMLDivElement | undefined = $state(undefined);

  let gridItemWidth = $state(0);
  let secondaryItemWidth = $state(0);
  let focusItemWidth = $state(0);
  const streamPlayers = new Map<number, OvenPlayerController>();

  function getOptimalTileWidth(
    containerWidth: number,
    containerHeight: number,
    items: number,
  ) {
    if (items === 0) {
      return 0;
    }

    const availableWidth = Math.max(containerWidth - CONTAINER_PADDING, 0);
    const availableHeight = Math.max(containerHeight - CONTAINER_PADDING, 0);

    let bestCols = 1;
    let bestArea = 0;

    for (let cols = 1; cols <= items; cols++) {
      const rows = Math.ceil(items / cols);
      const widthPerItem = (availableWidth - GAP * (cols - 1)) / cols;
      const heightPerItem = (availableHeight - GAP * (rows - 1)) / rows;

      if (widthPerItem <= 0 || heightPerItem <= 0) {
        continue;
      }

      const actualWidth = Math.min(widthPerItem, heightPerItem * ASPECT_RATIO);
      const actualHeight = actualWidth / ASPECT_RATIO;
      const area = actualWidth * actualHeight;

      if (area > bestArea) {
        bestArea = area;
        bestCols = cols;
      }
    }

    const rows = Math.ceil(items / bestCols);
    const widthPerItem = (availableWidth - GAP * (bestCols - 1)) / bestCols;
    const maxHeight = (availableHeight - GAP * (rows - 1)) / rows;
    const finalHeight = Math.min(widthPerItem / ASPECT_RATIO, maxHeight);

    return Math.max(finalHeight * ASPECT_RATIO, 0);
  }

  function getFocusTileWidth(containerWidth: number, containerHeight: number) {
    const availableWidth = Math.max(containerWidth - CONTAINER_PADDING, 0);
    const availableHeight = Math.max(containerHeight - CONTAINER_PADDING, 0);

    return Math.max(Math.min(availableWidth, availableHeight * ASPECT_RATIO), 0);
  }

  function observeResize(el: HTMLDivElement, onResize: () => void) {
    const observer = new ResizeObserver((entries) => {
      if (entries.length === 0) {
        return;
      }

      onResize();
    });

    observer.observe(el);
    onResize();

    return () => {
      observer.disconnect();
    };
  }

  function shouldIgnoreFocusToggle(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(target.closest("button, input, [data-controls], [data-no-focus-toggle]"));
  }

  function findConnectedUser(userId: number) {
    const user = server.findUser(userId);
    return user?.online ? user : undefined;
  }

  function getStreamPlayer(userId: number) {
    let player = streamPlayers.get(userId);

    if (!player) {
      player = new OvenPlayerController(server, userId, g.headphones);
      streamPlayers.set(userId, player);
    }

    return player;
  }

  function toggleTileFocus(tileId: string) {
    if (layoutMode === "focus" && focusedTileId === tileId) {
      layoutMode = "grid";
      focusedTileId = undefined;
      hideOthers = false;
      return;
    }

    layoutMode = "focus";
    focusedTileId = tileId;
  }

  function handleTileClick(tileId: string, event: MouseEvent) {
    if (shouldIgnoreFocusToggle(event.target)) {
      return;
    }

    toggleTileFocus(tileId);
  }

  function handleTileKeydown(tileId: string, event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    toggleTileFocus(tileId);
  }

  $effect(() => {
    if (!focusedTileId || !tiles.some((tile) => tile.id === focusedTileId)) {
      layoutMode = "grid";
      focusedTileId = undefined;
      hideOthers = false;
    }
  });

  $effect(() => {
    const activeStreamIds = new Set(
      roomUsers.filter((user) => user.streaming).map((user) => user.id),
    );

    for (const [userId, player] of streamPlayers) {
      if (activeStreamIds.has(userId)) {
        continue;
      }

      player.destroy();
      streamPlayers.delete(userId);
    }
  });

  $effect(() => {
    return () => {
      for (const player of streamPlayers.values()) {
        player.destroy();
      }
      streamPlayers.clear();
    };
  });

  $effect(() => {
    const tileCount = tiles.length;

    if (gridContainer) {
      gridItemWidth = getOptimalTileWidth(
        gridContainer.clientWidth,
        gridContainer.clientHeight,
        tileCount,
      );
    }
  });

  $effect(() => {
    const tileCount = secondaryTiles.length;

    if (secondaryContainer && !hideOthers) {
      secondaryItemWidth = getOptimalTileWidth(
        secondaryContainer.clientWidth,
        secondaryContainer.clientHeight,
        tileCount,
      );
    }
  });

  $effect(() => {
    if (focusContainer && layoutMode === "focus") {
      focusItemWidth = getFocusTileWidth(
        focusContainer.clientWidth,
        focusContainer.clientHeight,
      );
    }
  });
</script>

{#snippet tileContent(tile: Tile)}
  {@const user = findConnectedUser(tile.userId)}
  {#if user}
    {#if tile.kind === "user"}
      {@const peer = server.rtc.peers.get(user.id)}
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
    {:else}
      <Stream {server} {user} player={getStreamPlayer(user.id)} />
    {/if}
  {/if}
{/snippet}

{#snippet tileShell(tile: Tile, width: number)}
  <div
    class="shrink-0 cursor-pointer overflow-hidden rounded-md"
    role="button"
    tabindex="0"
    style:width={width > 0 ? `${width}px` : undefined}
    onclick={(event) => handleTileClick(tile.id, event)}
    onkeydown={(event) => handleTileKeydown(tile.id, event)}
  >
    {@render tileContent(tile)}
  </div>
{/snippet}

{#if layoutMode === "focus" && focusedTile}
  <div class="flex h-full w-full min-h-0 flex-col gap-2 p-2">
    <div class="flex justify-end">
      <Button
        size="sm"
        variant="secondary"
        data-no-focus-toggle
        onclick={() => {
          hideOthers = !hideOthers;
        }}
      >
        {hideOthers ? "Show others" : "Hide others"}
      </Button>
    </div>

    <div
      class="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
      bind:this={focusContainer}
      {@attach function(el) {
        focusContainer = el;
        return observeResize(el, () => {
          focusItemWidth = getFocusTileWidth(el.clientWidth, el.clientHeight);
        });
      }}
    >
      {@render tileShell(focusedTile, focusItemWidth)}
    </div>

    {#if !hideOthers && secondaryTiles.length > 0}
      <div
        class="flex max-h-1/3 min-h-0 flex-wrap content-start justify-center gap-2 overflow-y-auto"
        bind:this={secondaryContainer}
        {@attach function(el) {
          secondaryContainer = el;
          return observeResize(el, () => {
            secondaryItemWidth = getOptimalTileWidth(
              el.clientWidth,
              el.clientHeight,
              secondaryTiles.length,
            );
          });
        }}
      >
        {#each secondaryTiles as tile (tile.id)}
          {@render tileShell(tile, secondaryItemWidth)}
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div
    class="flex h-full w-full flex-wrap content-center justify-center gap-2 overflow-auto p-2"
    bind:this={gridContainer}
    {@attach function(el) {
      gridContainer = el;
      return observeResize(el, () => {
        gridItemWidth = getOptimalTileWidth(el.clientWidth, el.clientHeight, tiles.length);
      });
    }}
  >
    {#each tiles as tile (tile.id)}
      {@render tileShell(tile, gridItemWidth)}
    {/each}
  </div>
{/if}
