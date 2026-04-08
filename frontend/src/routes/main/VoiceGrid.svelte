<script lang="ts">
  import { BitsConfig } from "bits-ui";
  import {
    ChevronDown,
    ChevronUp,
    Fullscreen,
    PictureInPicture,
    Users,
    Volume2,
    VolumeOff,
  } from "@lucide/svelte";
  import type { ConnectedUser } from "trurpchat-backend";
  import GainSlider from "$lib/components/GainSlider.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import LoudnessContextMenu from "$lib/components/LoudnessContextMenu.svelte";
  import { Item as ContextItem } from "$lib/components/ui/context-menu";
  import Stream from "$lib/components/stream/Stream.svelte";
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
  const AUTO_HIDE_DELAY = 2000;

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
  let shouldHide = $state(true);
  let isFullscreen = $state(false);
  const immersiveFocus = $derived(
    layoutMode === "focus" && hideOthers && isFullscreen,
  );

  const focusedTile = $derived(tiles.find((tile) => tile.id === focusedTileId));
  const secondaryTiles = $derived(
    focusedTileId ? tiles.filter((tile) => tile.id !== focusedTileId) : [],
  );
  const focusedUser = $derived(findConnectedUser(focusedTile?.userId));
  const focusedPeer = $derived.by(() => {
    if (!focusedTile || focusedTile.kind !== "user" || !focusedUser) {
      return undefined;
    }

    if (focusedUser.id === server.user.id) {
      return undefined;
    }

    return server.rtc.peers.get(focusedUser.id);
  });
  const focusedPlayer = $derived.by(() => {
    if (!focusedTile || focusedTile.kind !== "stream" || !focusedUser) {
      return undefined;
    }

    return server.rtc.getStreamPlayer(focusedUser.id);
  });
  const focusedCanAdjustVolume = $derived(
    Boolean(focusedPeer || focusedPlayer),
  );

  let gridShell: HTMLDivElement | undefined = $state(undefined);
  let portalHost: HTMLDivElement | undefined = $state(undefined);
  let gridContainer: HTMLDivElement | undefined = $state(undefined);
  let secondaryContainer: HTMLDivElement | undefined = $state(undefined);
  let focusContainer: HTMLDivElement | undefined = $state(undefined);

  let hideTimeout: ReturnType<typeof setTimeout> | undefined;
  let gridItemWidth = $state(0);
  let secondaryItemWidth = $state(0);
  let focusItemWidth = $state(0);

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

  function getFocusTileWidth(
    containerWidth: number,
    containerHeight: number,
    padding: number = CONTAINER_PADDING,
  ) {
    const availableWidth = Math.max(containerWidth - padding, 0);
    const availableHeight = Math.max(containerHeight - padding, 0);

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

    const focusHeight = Math.max(
      availableHeight - secondaryHeight - (secondaryHeight > 0 ? GAP : 0),
      0,
    );

    focusItemWidth = getFocusTileWidth(
      availableWidth,
      focusHeight,
      immersiveFocus ? 0 : CONTAINER_PADDING,
    );
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

  function scheduleControlsHide() {
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      shouldHide = true;
    }, AUTO_HIDE_DELAY);
  }

  function toggleGridFullscreen() {
    if (!gridShell) {
      return;
    }

    if (!document.fullscreenElement) {
      gridShell.requestFullscreen();
      return;
    }

    document.exitFullscreen();
  }

  function attachGridShell(el: HTMLDivElement) {
    const onMouseMove = (event: MouseEvent) => {
      shouldHide = false;

      const target = event.target as HTMLElement;
      if (target.closest("[data-controls]")) {
        return;
      }

      scheduleControlsHide();
    };

    const onMouseLeave = () => {
      clearTimeout(hideTimeout);
      shouldHide = true;
    };

    const onDblClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-controls]")) {
        return;
      }

      toggleGridFullscreen();
    };

    const onFullscreenChange = () => {
      isFullscreen = document.fullscreenElement === el;
    };

    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseleave", onMouseLeave);
    el.addEventListener("dblclick", onDblClick);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      clearTimeout(hideTimeout);
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mouseleave", onMouseLeave);
      el.removeEventListener("dblclick", onDblClick);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
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
    if (userId === undefined) {
      return undefined;
    }

    const user = server.findUser(userId);
    return user?.online ? user : undefined;
  }

  function getFocusedGain() {
    if (focusedPeer) {
      return focusedPeer.volume;
    }

    if (focusedPlayer) {
      return focusedPlayer.gain;
    }

    return 0;
  }

  function setFocusedGain(value: number) {
    if (focusedPeer) {
      focusedPeer.volume = value;
      return;
    }

    if (focusedPlayer) {
      focusedPlayer.gain = value;
    }
  }

  function isFocusedMuted() {
    if (focusedPeer) {
      return focusedPeer.mute;
    }

    if (focusedPlayer) {
      return focusedPlayer.gain === 0;
    }

    return false;
  }

  function setFocusedMuted(value: boolean) {
    if (focusedPeer) {
      focusedPeer.mute = value;
      return;
    }

    if (focusedPlayer) {
      focusedPlayer.setMuted(value);
    }
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
    return () => {
      clearTimeout(hideTimeout);
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

{#snippet tileContent(tile: Tile, edgeToEdge = false)}
  {@const user = findConnectedUser(tile.userId)}
  {#if user}
    {#if tile.kind === "user"}
      {@const peer = server.rtc.peers.get(user.id)}
      {#if user.id === server.user.id}
        <ContextMenu>
          {#snippet menu()}
            <LoudnessContextMenu
              bind:gain={g.mic.gain}
              bind:muted={g.mic.muted}
            />
          {/snippet}
          <VoiceUserCard
            {user}
            speaking={g.mic.speaking && !g.muted}
            cameraStream={g.camera.showMyVideo ? g.camera.stream : undefined}
            shouldHideInfo={shouldHide}
            {edgeToEdge}
          />
        </ContextMenu>
      {:else if peer}
        <ContextMenu>
          {#snippet menu()}
            <LoudnessContextMenu
              bind:gain={peer.volume}
              bind:muted={peer.mute}
            />
            {#if peer.cameraStream}
              <ContextItem
                class="flex items-center justify-between"
                onclick={() => {
                  const video = document.getElementById(
                    `user-${user.id}-camera`,
                  ) as HTMLVideoElement;
                  if (!video) {
                    return;
                  }
                  video.requestPictureInPicture();
                }}
              >
                Picture in picture
                <PictureInPicture />
              </ContextItem>
            {/if}
          {/snippet}
          <VoiceUserCard
            speaking={peer.speaking ?? false}
            mutedByMe={peer?.mute}
            {user}
            cameraStream={peer.cameraStream}
            shouldHideInfo={shouldHide}
            {edgeToEdge}
          />
        </ContextMenu>
      {:else}
        <VoiceUserCard
          speaking={false}
          {user}
          cameraStream={undefined}
          shouldHideInfo={shouldHide}
          {edgeToEdge}
        />
      {/if}
    {:else}
      {@const player = server.rtc.getStreamPlayer(user.id)}
      {#if player}
        <Stream
          {server}
          {user}
          {player}
          shouldHideInfo={shouldHide}
          {edgeToEdge}
        />
      {/if}
    {/if}
  {/if}
{/snippet}

{#snippet tileShell(tile: Tile, width: number, edgeToEdge = false)}
  <div
    class="shrink-0 cursor-pointer overflow-hidden {edgeToEdge ? 'rounded-none' : 'rounded-md'}"
    role="button"
    tabindex="0"
    style:width={width > 0 ? `${width}px` : undefined}
    onclick={(event) => handleTileClick(tile.id, event)}
    onkeydown={(event) => handleTileKeydown(tile.id, event)}
  >
    {@render tileContent(tile, edgeToEdge)}
  </div>
{/snippet}

<BitsConfig defaultPortalTo={isFullscreen ? portalHost : undefined}>
  <div
    class="relative h-full w-full overflow-hidden"
    class:cursor-none={shouldHide}
    bind:this={gridShell}
    {@attach attachGridShell}
  >
    <div bind:this={portalHost} class="contents"></div>

    {#if layoutMode === "focus" && focusedTile}
      <div
        class="flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden {immersiveFocus ? 'p-0' : 'p-2'}"
        bind:this={focusContainer}
        {@attach function(el) {
          focusContainer = el;
          return observeResize(el, updateFocusLayout);
        }}
      >
        <div
          class="flex max-h-full w-full max-w-full flex-col items-center justify-center gap-2 overflow-hidden"
        >
          <div
            class="relative flex max-w-full items-center justify-center overflow-visible"
          >
            {@render tileShell(focusedTile, focusItemWidth, immersiveFocus)}

            <div
              class="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 transition-opacity duration-100 {shouldHide && 'opacity-0'} {hideOthers ? 'bottom-3' : '-bottom-10'}"
            >
              <div
                data-controls
                class="rounded-md bg-background/80 pointer-events-auto"
              >
                <Button
                  variant="ghost"
                  class="flex gap-1 px-2"
                  data-no-focus-toggle
                  onclick={() => {
                    hideOthers = !hideOthers;
                    updateFocusLayout();
                  }}
                >
                  <Users class="size-4" />
                  {#if hideOthers}
                    <ChevronUp class="size-4" />
                  {:else}
                    <ChevronDown class="size-4" />
                  {/if}
                </Button>
              </div>
            </div>
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

    <div
      class="pointer-events-none absolute inset-0 transition-opacity duration-100 {shouldHide && 'opacity-0'}"
    >
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 h-28"
        style="background: linear-gradient(to top, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 20%, rgba(0, 0, 0, 0.1) 60%, rgba(0, 0, 0, 0) 100%);"
      ></div>

      <div
        class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2"
      >
        <div></div>

        <div
          data-controls
          class="flex items-center gap-2 bg-background/80 rounded-md pointer-events-auto"
        >
          {#if layoutMode === "focus" && focusedCanAdjustVolume}
            <div class="w-36 flex items-center gap-2">
              <Button
                variant="ghost"
                class="p-0"
                onclick={() => {
                  setFocusedMuted(!isFocusedMuted());
                }}
              >
                {#if isFocusedMuted()}
                  <VolumeOff class="size-4" />
                {:else}
                  <Volume2 class="size-4" />
                {/if}
              </Button>
              <GainSlider
                class="w-full mt-1"
                bind:value={() => getFocusedGain(), (value) => setFocusedGain(value)}
                ticks={[1]}
              />
            </div>
          {/if}
          <div class="rounded-md bg-background/80 pointer-events-auto">
            <Button class="p-0" variant="ghost" onclick={toggleGridFullscreen}>
              <Fullscreen class="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</BitsConfig>
