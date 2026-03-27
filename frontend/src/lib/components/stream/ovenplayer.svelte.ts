import { audioctx } from "$lib/audio/context";
import type { Headphones } from "$lib/headphones.svelte";

const DEFAULT_GAIN = 0.6;

export class OvenAudioController {
  audioSource: MediaStreamAudioSourceNode | undefined = $state(undefined);
  state: "disconnected" | "connected" = $state("disconnected");
  gainnode: GainNode;

  #gain = $state(DEFAULT_GAIN);
  get gain() {
    return this.#gain;
  }
  set gain(value: number) {
    this.#gain = value;
    this.gainnode.gain.setTargetAtTime(value, audioctx().currentTime, 0.01);
  }

  connect() {
    this.disconnect();
    this.state = "connected";
  }

  disconnect() {
    this.state = "disconnected";
    this.audioSource?.disconnect();
    this.headphones.removeSource(this.gainnode);
  }

  constructor(public headphones: Headphones) {
    const ctx = audioctx();
    this.gainnode = ctx.createGain();
    this.gainnode.gain.setTargetAtTime(
      DEFAULT_GAIN,
      audioctx().currentTime,
      0.01,
    );
    headphones.addSource(this.gainnode);
  }
}
