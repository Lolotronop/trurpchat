import { getContext, setContext } from "svelte";
import { Gateway } from "./gateway.svelte";
import { Mic } from "./mic.svelte";
import { WebRTC } from "./webrtc.svelte";

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
  ready: boolean = $state(false);

  constructor(context: AudioContext) {
    const createGate = () => {
      const gate = new AudioWorkletNode(context, "noise-gate");
      return gate;
    };
    const createLoudnessMeter = () => {
      const meter = new AudioWorkletNode(context, "loudness");
      return meter;
    };

    this.c = context;
    this.mic = new Mic(context, createGate, createLoudnessMeter);
    this.mic.init();
    this.ws = new Gateway();
    this.rtc = new WebRTC(this.ws, this.mic, context, createLoudnessMeter);
    this.lock = new WakeLockContainer();
    this.lock.lock();

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
