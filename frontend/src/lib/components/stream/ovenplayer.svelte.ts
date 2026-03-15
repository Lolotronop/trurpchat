import { audioctx } from "$lib/audio/context";

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
  }

  constructor() {
    const ctx = audioctx();
    this.gainnode = ctx.createGain();
    this.gainnode.gain.setTargetAtTime(
      DEFAULT_GAIN,
      audioctx().currentTime,
      0.01,
    );
    this.gainnode.connect(ctx.destination);
  }
}
