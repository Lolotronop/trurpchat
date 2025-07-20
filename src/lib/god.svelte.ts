import { untrack } from "svelte";
import { Gateway } from "./gateway.svelte";
import { Mic } from "./mic.svelte";
import { WebRTC } from "./webrtc.svelte";
import { Shortcuts } from "./shortcuts.svelte";
import { Settings } from "./settings.svelte";

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
    this.#deafened = value;
    this.ws.send({
      type: "deafened",
      deafened: value,
    });
    if (value) {
      this.muted = true;
    }
    this.rtc.deafenNode.gain.setTargetAtTime(
      value ? 0 : 1,
      this.c.currentTime,
      0.01,
    );
  }

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

    this.settings = new Settings(this.tauri);
    this.c = context;
    this.mic = new Mic(this);
    this.ws = new Gateway();
    this.lock = new WakeLockContainer();
    this.lock.lock();

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

    $effect.root(() => {
      $effect(() => {
        if (this.settings.ready) {
          this.ws.connect(
            `ws://${this.settings.settings.gatewayServer}?name=${this.settings.settings.username}`,
          );
        }
      });
      $effect(() => {
        if (this.settings.ready) {
          untrack(() => this.mic.init());
        }
      });
      $effect(() => {
        this.ready =
          this.mic.hasPermissions &&
          this.ws.connected &&
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
        "You have to provide and AudioContext with all the plugins loaded at first initialization",
      );
    }
    instance = new God(audioContext, tauri);
  }
  return instance;
}
