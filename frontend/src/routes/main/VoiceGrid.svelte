<script lang="ts">
  import type { ConnectedUser } from "trurpchat-backend";
  import LoudnessContext from "$lib/components/LoudnessContext.svelte";
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
        nextTiles.unshift({
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
  let focusControlsContainer: HTMLDivElement | undefined = $state(undefined);

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

    return Math.max(
      Math.min(availableWidth, availableHeight * ASPECT_RATIO),
      0,
    );
  }

  function getWrappedBlockHeight(
    containerWidth: number,
    itemWidth: number,
    items: number,
  ) {
    if (items === 0 || itemWidth <= 0) {
      return 0;
    }

    const availableWidth = Math.max(containerWidth - CONTAINER_PADDING, 0);
    const cols = Math.max(
      1,
      Math.floor((availableWidth + GAP) / (itemWidth + GAP)),
    );
    const rows = Math.ceil(items / cols);
    const itemHeight = itemWidth / ASPECT_RATIO;

    return rows * itemHeight + Math.max(rows - 1, 0) * GAP;
  }

  function updateFocusLayout() {
    if (!focusContainer || layoutMode !== "focus") {
      return;
    }

    const controlsHeight = focusControlsContainer?.offsetHeight ?? 0;
    const availableWidth = focusContainer.clientWidth;
    const availableHeight = focusContainer.clientHeight;
    const secondaryHeightBudget = hideOthers
      ? 0
      : Math.min(Math.max(availableHeight * 0.28, 120), 320);

    secondaryItemWidth = hideOthers
      ? 0
      : getOptimalTileWidth(
          availableWidth,
          secondaryHeightBudget,
          secondaryTiles.length,
        );

    const secondaryHeight = hideOthers
      ? 0
      : getWrappedBlockHeight(
          availableWidth,
          secondaryItemWidth,
          secondaryTiles.length,
        );

    const reservedHeight =
      controlsHeight + (controlsHeight > 0 ? GAP : 0) + secondaryHeight;
    const focusHeight = Math.max(availableHeight - reservedHeight - GAP, 0);

    focusItemWidth = getFocusTileWidth(availableWidth, focusHeight);
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

    return Boolean(
      target.closest("button, input, [data-controls], [data-no-focus-toggle]"),
    );
  }

  function findConnectedUser(userId: number | undefined) {
    if (!userId) return;
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

  function isStreamMuted(userId: number) {
    return getStreamPlayer(userId).gain === 0;
  }

  function setStreamMuted(userId: number, muted: boolean) {
    getStreamPlayer(userId).setMuted(muted);
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
      updateFocusLayout();
    }
  });
</script>

{#snippet tileContent(tile: Tile)}
  {@const user = findConnectedUser(tile?.userId)}
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
      {:else if peer}
        <LoudnessContext bind:gain={peer.volume} bind:muted={peer.mute}>
          <VoiceUserCard
            name={user.name}
            speaking={peer?.speaking || false}
            muted={peer?.mute || user.muted || false}
            deafened={user.deafened || false}
            camera={user.camera}
            cameraStream={peer?.cameraStream}
          />
        </LoudnessContext>
      {:else}
        <VoiceUserCard
          name={user.name}
          speaking={false}
          muted={user.muted || false}
          deafened={user.deafened || false}
          camera={user.camera}
          cameraStream={undefined}
        />
      {/if}
    {:else}
      {@const player = getStreamPlayer(user.id)}
      {#if user.id === server.user.id}
        <Stream {server} {user} {player} />
      {:else}
        <LoudnessContext
          bind:gain={player.gain}
          bind:muted={() => isStreamMuted(user.id), (muted) => setStreamMuted(user.id, muted)}
        >
          <Stream {server} {user} {player} />
        </LoudnessContext>
      {/if}
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
  <div
    class="flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden p-2"
    bind:this={focusContainer}
    {@attach function(el) {
      focusContainer = el;
      return observeResize(el, updateFocusLayout);
    }}
  >
    <div
      class="flex max-h-full w-full max-w-full flex-col items-center justify-center gap-2 overflow-hidden"
    >
      <div class="flex w-full justify-end" bind:this={focusControlsContainer}>
        <Button
          size="sm"
          variant="secondary"
          data-no-focus-toggle
          onclick={() => {
            hideOthers = !hideOthers;
            updateFocusLayout();
          }}
        >
          {hideOthers ? "Show others" : "Hide others"}
        </Button>
      </div>

      <div class="flex max-w-full items-center justify-center overflow-hidden">
        {@render tileShell(focusedTile, focusItemWidth)}
      </div>

      {#if !hideOthers && secondaryTiles.length > 0}
        <div
          class="flex max-h-full w-full flex-wrap justify-center gap-2 overflow-y-auto overflow-x-hidden"
          bind:this={secondaryContainer}
          {@attach function(el) {
          secondaryContainer = el;
          return observeResize(el, updateFocusLayout);
        }}
        >
          {#each secondaryTiles as tile (tile.id)}
            {@render tileShell(tile, secondaryItemWidth)}
          {/each}
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div
    class="flex h-full w-full min-h-0 min-w-0 flex-wrap content-center justify-center gap-2 overflow-auto p-2"
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
