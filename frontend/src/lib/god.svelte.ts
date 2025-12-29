import { untrack } from "svelte";
import { Gateway } from "./gateway.svelte";
import { Mic } from "./mic.svelte";
import { WebRTC } from "./webrtc.svelte";
import { Shortcuts } from "./shortcuts.svelte";
import { Settings } from "./settings.svelte";
import { Theme } from "./theme.svelte";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Sound } from "./sound.svelte";

class WakeLockContainer {
  wakeLock: WakeLockSentinel | null = $state(null);

  async lock() {
    if (!this.wakeLock) {
      this.wakeLock = await navigator.wakeLock.request("screen");
    }
  }

  async release() {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
    }
  }
}

export class God {
  tauri: boolean;
  c: AudioContext;
  mic: Mic;
  rtc: WebRTC;
  ws: Gateway;
  lock: WakeLockContainer;
  keys: Shortcuts = new Shortcuts();
  ready: boolean = $state(false);
  settings: Settings;
  theme: Theme;
  sound: Sound;

  createGate: () => AudioWorkletNode;
  createLoudnessMeter: () => AudioWorkletNode;

  #muted: boolean = $state(false);
  get muted() {
    return this.#muted;
  }
  set muted(value) {
    this.settings.settings.muted = value;
    this.#muted = value;
    if (value == false) {
      this.deafened = false;
      this.sound.play("unmute");
    } else {
      this.sound.play("mute");
    }
    this.mic.nodes.outputGain.gain.setTargetAtTime(
      value ? 0 : 1,
      this.c.currentTime,
      0.01,
    );
    this.ws.send({ type: "muted", muted: value });
  }

  #deafened: boolean = $state(false);
  get deafened() {
    return this.#deafened;
  }
  set deafened(value: boolean) {
    if (value === this.#deafened) return;
    this.#deafened = value;
    this.ws.send({
      type: "deafened",
      deafened: value,
    });
    if (value) {
      this.muted = true;
      this.sound.play("deafen");
    } else {
      this.sound.play("undeafen");
    }
    this.rtc.deafenNode.gain.setTargetAtTime(
      value ? 0 : 1,
      this.c.currentTime,
      0.01,
    );
  }

  allowPause: boolean = $state(false);

  constructor(context: AudioContext, tauri: boolean) {
    this.tauri = tauri;
    this.createGate = () => {
      const gate = new AudioWorkletNode(context, "noise-gate");
      return gate;
    };
    this.createLoudnessMeter = () => {
      const meter = new AudioWorkletNode(context, "loudness");
      return meter;
    };

    this.settings = new Settings();
    this.c = context;
    this.mic = new Mic(this);
    this.ws = new Gateway();
    this.lock = new WakeLockContainer();
    this.lock.lock();
    this.theme = new Theme(this);
    this.sound = new Sound(this);
    this.sound.init();

    this.rtc = new WebRTC(this);

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

    this.ws.onmessage = (msg) => {
      if (msg.type === "pause") {
        this.allowPause && isTauri() && invoke("pause");
      }
    };

    $effect.root(() => {
      $effect(() => {
        if (this.settings.ready) {
          const username = this.settings.settings.servers.find((server) => server.url === this.settings.settings.avtiveServerUrl)?.username;
          if (!username) {
            console.error("Username not found");
            return;
          }
          const url = this.settings.settings.avtiveServerUrl;
          this.ws.connect(
            `ws://${url}?name=${username}`,
          );
        }
      });
      $effect(() => {
        if (this.settings.ready) {
          untrack(() => this.mic.init());
          untrack(() => {
            this.theme.selected = this.settings.settings.theme;
            this.theme.customCss = this.settings.settings.customCss;
          });
        }
      });
      $effect(() => {
        this.ready =
          this.mic.hasPermissions &&
          // this.ws.connected &&
          this.sound.ready &&
          // !!this.lock.wakeLock &&
          this.settings.ready;
      });
    });
  }
}

let instance: God | null = null;
export function gitGud(audioContext?: AudioContext, tauri?: boolean): God {
  if (!instance) {
    if (!audioContext || tauri === undefined) {
      throw new Error(
        `You have to provide and AudioContext with all the plugins loaded at first initialization ${audioContext}`,
      );
    }
    instance = new God(audioContext, tauri);
  }
  return instance;
}
