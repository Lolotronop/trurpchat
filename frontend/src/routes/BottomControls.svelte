<script lang="ts">
  import {
    Camera,
    HeadphoneOff,
    Headphones,
    Info,
    Mic,
    MicOff,
    MonitorUp,
    PhoneOff,
  } from "@lucide/svelte";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import Avatar from "$lib/components/Avatar.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { gitGud } from "$lib/god.svelte";
  import type { Server } from "$lib/servers.svelte";
  import { StreamSettings as StreamSettingsClass } from "$lib/stream-settings.svelte";
  import Settings from "./Settings.svelte";
  import StreamSettings from "./StreamSettings.svelte";
  import { username } from "$lib/utils.svelte";

  const g = gitGud();

  type Props = {
    server: Server;
  };
  const { server }: Props = $props();

  function formatTime(timeMS: number): string {
    const hours = Math.floor(timeMS / 3600000);
    const minutes = Math.floor((timeMS % 3600000) / 60000);
    const seconds = Math.floor((timeMS % 60000) / 1000);
    const pad = (num: number) => num.toString().padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  let rtc = $derived(server.rtc);

  let streamSettings = $state(new StreamSettingsClass());

  if (isTauri()) {
    listen<boolean>("stream-status", (event) => {
      if (!rtc) {
        console.warn("Recieved stream-status event but rtc is not defined");
        return;
      }
      if (!rtc.connected) {
        console.warn("Recieved stream-status event but rtc is not connected");
        return;
      }
      rtc.streaming = event.payload;
    });
  }
</script>

<div class="text-muted-foreground rounded border-t px-2 flex flex-col w-full">
  {#if rtc.connected && rtc.room}
    <div class="flex flex-row items-center justify-between gap-2 py-2">
      <Tooltip.Root delayDuration={100}>
        <Tooltip.Trigger class="flex flex-col items-start">
          <div class="hover:text-foreground flex flex-row items-center gap-2">
            <Info size={16} />
            {rtc.room.name}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content class="w-34">
          <div class="flex w-full flex-row items-center justify-center gap-2">
            <p class="text-muted-foreground font-mono text-sm">
              {formatTime(rtc.connectedFor)}
            </p>
          </div>
          <div>
            {#each rtc.room.users as userId}
              {@const user = server.findUser(userId)}
              {#if user?.online && user.id !== server.user.id}
                {@const peer = rtc.peers.get(user.id)}
                <div class="flex w-full flex-row justify-between">
                  <p>{username(user)}</p>
                  <p>{peer?.ping ?? "N/A"}ms</p>
                </div>
              {/if}
            {/each}
          </div>
        </Tooltip.Content>
      </Tooltip.Root>

      <div class="flex flex-row items-center gap-2">
        {#if server.overServerUrl}
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger class="max-w-28">
              <Button
                variant={rtc.streaming ? "default" : "ghost"}
                class="size-8"
                onclick={() => {
                  if (!isTauri()) return;
                  if (rtc.streaming) {
                    invoke("stop_stream");
                    return;
                  }

                  const domain = server.overServerUrl?.split(":")[0];
                  if (!domain) return;
                  const options = {
                    url: `rtmp://${domain}:1935/app/${server.definition.id}-${server.user.id}`,
                    width: streamSettings.width,
                    height: streamSettings.height,
                    audioBitrate: streamSettings.audioBitrate,
                    videoBitrate: streamSettings.videoBitrate,
                    fps: streamSettings.fps,
                    presetNum: streamSettings.presetNum,
                    useHwAccel: streamSettings.useHwAccel,
                  };
                  invoke("start_stream", options);
                }}
              >
                <MonitorUp class="size-5" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content
              class="flex flex-col gap-2 bg-background border pb-4"
            >
              {#if import.meta.env.DEV}
                <div class="flex flex-row items-center gap-2">
                  <Button
                    variant="outline"
                    class="text-sm w-full"
                    onclick={() => {
                      rtc.streaming = !rtc.streaming;
                    }}
                  >
                    Холостой
                  </Button>
                </div>
              {/if}
              <!-- <div class="flex flex-row items-center gap-2"> -->
              <!--   <Switch id="airplane-mode" bind:checked={g.allowPause} /> -->
              <!--   <Label for="airplane-mode">Разрешить удаленную паузу</Label> -->
              <!-- </div> -->
              <!-- <div> -->
              <!--   <Button -->
              <!--     variant="outline" -->
              <!--     class="text-sm" -->
              <!--     onclick={() => { -->
              <!--       const base = server.overServerUrl!; -->
              <!--       const user = server.user!; -->
              <!--       const baseUrl = new URL(base); -->
              <!--       const host = baseUrl.hostname; -->
              <!--       const streamUrl = `rtmp://${host}:1935/app/${user.id}`; -->

              <!--       navigator.clipboard.writeText(streamUrl); -->
              <!--     }} -->
              <!--   > -->
              <!--     Скопировать ссылку для ОБС -->
              <!--   </Button> -->
              <!-- </div> -->
              <StreamSettings bind:settings={streamSettings} />
            </Tooltip.Content>
          </Tooltip.Root>
        {/if}

        <Tooltip.Root delayDuration={300}>
          <Tooltip.Trigger>
            <Button
              variant={rtc.camera ? "default" : "ghost"}
              class="size-8"
              onclick={() => {
                rtc.camera = !rtc.camera;
              }}
            >
              <Camera class="size-5" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <div class="flex flex-row items-center justify-between gap-2">
              <Label class="w-full" for="show-my-camera">
                Показывать мою камеру
              </Label>
              <Switch id="show-my-camera" bind:checked={g.camera.showMyVideo} />
            </div>
          </Tooltip.Content>
        </Tooltip.Root>

        <Button
          variant="ghost"
          class="size-8"
          onclick={() => {
            server.leaveRoom();
          }}
        >
          <PhoneOff class="size-5" />
        </Button>
      </div>
    </div>
    <div class="border-t"></div>
  {/if}
  <div
    class="bg-background flex h-16 flex-row shrink items-center justify-between"
  >
    <div class="flex grow shrink flex-row items-center gap-1 min-w-0">
      <Avatar class="size-10 shrink-0" name={username(server.user)}></Avatar>

      <Tooltip.Root delayDuration={100}>
        <Tooltip.Trigger class="flex min-w-0 flex-1">
          <p class="text-foreground truncate">{username(server.user)}</p>
        </Tooltip.Trigger>
        <Tooltip.Content>{server.user.name}</Tooltip.Content>
      </Tooltip.Root>
    </div>
    <div class="flex flex-row items-center gap-2 shrink-0">
      <Button
        variant={g.muted ? "destructive" : "ghost"}
        class="size-8"
        onclick={() => {
          g.muted = !g.muted;
        }}
      >
        {#if !g.muted}
          <Mic class="size-5" />
        {:else}
          <MicOff class="size-5" />
        {/if}
      </Button>

      <Button
        variant={g.deafened ? "destructive" : "ghost"}
        class="size-8"
        onclick={() => {
          g.deafened = !g.deafened;
        }}
      >
        {#if !g.deafened}
          <Headphones class="size-5" />
        {:else}
          <HeadphoneOff class="size-5" />
        {/if}
      </Button>

      <Settings {server} />
    </div>
  </div>
</div>
