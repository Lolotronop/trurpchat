import { audioctx } from "./context";
import type { EffectNode } from "./shared";

export class GainEffect implements EffectNode {
  private ctx = audioctx();
  node = this.ctx.createGain();
  private lastgain: number = 1;
  readonly bypassed = $state(false);

  #gain: number = $state(1);
  get gain() {
    return this.#gain;
  }
  set gain(value: number) {
    this.#gain = value;
    this.node.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  #muted = $state(false);
  set muted(value: boolean) {
    if (value) {
      this.lastgain = this.gain;
      this.gain = 0;
    } else {
      this.gain = this.lastgain;
    }
  }

  get muted() {
    return this.#muted;
  }

  constructor(gain = 1, muted = false) {
    this.#gain = gain;
    this.#muted = muted;
  }
}
