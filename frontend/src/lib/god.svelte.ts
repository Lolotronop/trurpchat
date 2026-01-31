import { Mic } from "./mic.svelte";
import { Shortcuts } from "./shortcuts.svelte";
import { Settings } from "./settings.svelte";
import { Theme } from "./theme.svelte";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { sound } from "./sound.svelte";
import { WakeLockContainer } from "./wakelock";
import { audioctx } from "./audio/context";
import { ServerManager } from "./servers.svelte";

export class God {
  mic: Mic;
  lock: WakeLockContainer;
  keys: Shortcuts = new Shortcuts();
  settings: Settings;
  theme: Theme;
  servers: ServerManager;

  get muted() {
    return this.mic.muted;
  }
  set muted(value) {
    if (value == false) {
      this.deafened = false;
      sound.play("unmute");
    } else {
      sound.play("mute");
    }
    this.mic.muted = value;
    // TODO: think about where and when this shoud actually happen
    this.servers.selected?.gateway.send({
      type: "action.voice.userstate",
      muted: value,
    });
  }

  #deafened: boolean = $state(false);
  get deafened() {
    return this.#deafened;
  }
  set deafened(value: boolean) {
    if (value === this.#deafened) return;
    this.#deafened = value;
    // TODO: think about where and when this should actually happen
    this.servers.selected?.gateway?.send({
      type: "action.voice.userstate",
      deafened: value,
    });
    if (value) {
      this.muted = true;
      sound.play("deafen");
    } else {
      sound.play("undeafen");
    }

    // TODO: this should probably work by having a separate output in the
    // mic or somethig that I can mute with the button
    // this way it doesn't actually depend on global state or smth?
    this.servers.selected?.rtc?.deafenNode.gain.setTargetAtTime(
      value ? 0 : 1,
      audioctx().currentTime,
      0.01,
    );
  }

  #allowPause: boolean = $state(false);
  get allowPause() {
    return this.#allowPause;
  }
  set allowPause(value: boolean) {
    this.#allowPause = value;
    this.settings.set("allowPause", value);
  }

  constructor() {
    this.settings = new Settings();
    this.mic = new Mic();
    this.lock = new WakeLockContainer();
    this.lock.lock();
    this.theme = new Theme();
    this.servers = new ServerManager();

    this.keys.on("mute", (state) => {
      if (state === "Released") {
        this.muted = !this.muted;
      }
    });

    this.keys.on("deafen", (state) => {
      if (state === "Released") {
        this.deafened = !this.deafened;
      }
    });

    // TODO: there will be a bug!
    // if the server is not connected it wont do do that
    // move this to when joining voice channel?
    this.servers.selected?.gateway?.onmessage((msg) => {
      if (msg.type === "action.voice.pause") {
        this.allowPause && isTauri() && invoke("pause");
      }
    });
  }
}

let instance: God | null = null;
export function gitGud(): God {
  if (!instance) {
    instance = new God();
  }
  return instance;
}
