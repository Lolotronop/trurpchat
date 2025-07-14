import { getContext, setContext } from "svelte";
import { Gateway } from "./gateway.svelte";
import { Mic } from "./mic.svelte";
import { WebRTC } from "./webrtc.svelte";
import { Shortcuts } from "./shortcuts.svelte";

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
  c: AudioContext;
  mic: Mic;
  rtc: WebRTC;
  ws: Gateway;
  lock: WakeLockContainer;
  keys: Shortcuts = new Shortcuts();
  ready: boolean = $state(false);

  createGate: () => AudioWorkletNode;
  createLoudnessMeter: () => AudioWorkletNode;

  constructor(context: AudioContext) {
    this.createGate = () => {
      const gate = new AudioWorkletNode(context, "noise-gate");
      return gate;
    };
    this.createLoudnessMeter = () => {
      const meter = new AudioWorkletNode(context, "loudness");
      return meter;
    };

    this.c = context;
    this.mic = new Mic(context, this.createGate, this.createLoudnessMeter);
    this.mic.init();
    this.ws = new Gateway();
    this.rtc = new WebRTC(this.ws, this.mic, context, this.createLoudnessMeter);
    this.lock = new WakeLockContainer();
    this.lock.lock();

    this.keys.on("mute", (state) => {
      if (state === "Released") {
        this.mic.muted = !this.mic.muted;
      }
    });

    $effect.root(() => {
      $effect(() => {
        this.ready =
          this.mic.hasPermissions && this.ws.connected && !!this.lock.wakeLock;
      });
    });
  }
}

let instance: God | null = null;
export function gitGud(audioContext?: AudioContext): God {
  if (!instance) {
    if (!audioContext) {
      throw new Error(
        "You have to provide and AudioContext with all the plugins loaded at first initialization",
      );
    }
    instance = new God(audioContext);
  }
  return instance;
}
