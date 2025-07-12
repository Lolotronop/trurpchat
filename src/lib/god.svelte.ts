import { getContext, setContext } from "svelte";
import { Gateway } from "./gateway.svelte";
import { Mic } from "./mic.svelte";
import { WebRTC } from "./webrtc.svelte";

export class God {
  c: AudioContext;
  mic: Mic;
  rtc: WebRTC;
  ws: Gateway;
  constructor() {
    const context = new AudioContext();
    context.audioWorklet.addModule("noise-gate.js");
    context.audioWorklet.addModule("loudness.js");
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
    this.ws = new Gateway();
    this.rtc = new WebRTC(this.ws, this.mic, context, createLoudnessMeter);
  }

  async init() {
    await this.mic.init();
    await navigator.wakeLock.request("screen");
    this.ws.connect("ws://localhost:3000");
  }
}

export function gitGud() {
  if (!getContext("god")) {
    setContext("god", new God());
  }
  return getContext("god");
}
