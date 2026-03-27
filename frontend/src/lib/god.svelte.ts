import { invoke, isTauri } from "@tauri-apps/api/core";
import { Camera } from "./camera.svelte";
import { Headphones } from "./headphones.svelte";
import { Mic } from "./mic.svelte";
import { ServerManager } from "./servers.svelte";
import { Settings } from "./settings.svelte";
import { Shortcuts } from "./shortcuts.svelte";
import { sound } from "./sound.svelte";
import { Theme } from "./theme.svelte";
import { WakeLockContainer } from "./wakelock";

export class God {
  camera: Camera;
  headphones: Headphones;
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
    if (value === false) {
      this.deafened = false;
      sound.play("unmute");
    } else {
      sound.play("mute");
    }
    this.mic.muted = value;
    // TODO: think about where and when this shoud actually happen
    this.servers.selected?.gateway.send({
      type: "action.user.state",
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
      type: "action.user.state",
      deafened: value,
    });
    if (value) {
      this.muted = true;
      sound.play("deafen");
    } else {
      sound.play("undeafen");
    }

    this.headphones.muted = value;
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
    this.camera = new Camera();
    this.headphones = new Headphones();
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
