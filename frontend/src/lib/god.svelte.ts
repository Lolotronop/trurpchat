import { Mic } from "./mic.svelte";
import { Shortcuts } from "./shortcuts.svelte";
import { Settings } from "./settings.svelte";
import { Theme } from "./theme.svelte";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Sound } from "./sound.svelte";
import { WakeLockContainer } from "./wakelock";
import { getAudioContext } from "./audiocontext";
import { ServerManager } from "./servers.svelte";

export class God {
  mic: Mic;
  lock: WakeLockContainer;
  keys: Shortcuts = new Shortcuts();
  settings: Settings;
  theme: Theme;
  sound: Sound;
  servers: ServerManager;

  #muted: boolean = $state(false);
  get muted() {
    return this.#muted;
  }
  set muted(value) {
    this.settings.set("muted", value);
    this.#muted = value;
    if (value == false) {
      this.deafened = false;
      this.sound.play("unmute");
    } else {
      this.sound.play("mute");
    }
    this.mic.nodes.outputGain.gain.setTargetAtTime(
      value ? 0 : 1,
      getAudioContext().currentTime,
      0.01,
    );
    // TODO: think about where and when this shoud actually happen
    this.servers.selected?.gateway?.send({
      type: "action.voice.mute",
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
      type: "action.voice.deafen",
      deafened: value,
    });
    if (value) {
      this.muted = true;
      this.sound.play("deafen");
    } else {
      this.sound.play("undeafen");
    }
    // TODO: somehow make this work
    // this..deafenNode.gain.setTargetAtTime(
    //   value ? 0 : 1,
    //   getAudioContext().currentTime,
    //   0.01,
    // );
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
    this.sound = new Sound();
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
