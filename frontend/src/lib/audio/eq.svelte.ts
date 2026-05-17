import { audioctx } from "./context";
import type { EffectNode } from "./shared";

/**
 * Creates a highpass filter (20hz, 0.707q) by default
 */
export class EQEffect implements EffectNode {
  ctx = audioctx();
  node: BiquadFilterNode = this.ctx.createBiquadFilter();
  bypassed: boolean = $state(false);

  #frequency: number = $state(20);
  set frequency(value) {
    this.#frequency = value;
    this.node.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  get frequency() {
    return this.#frequency;
  }

  #q: number = $state(0.707);
  set q(value) {
    this.#q = value;
    this.node.Q.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  get q() {
    return this.#q;
  }

  /**
   * Creates a highpass filter by default
   */
  constructor(frequency: number = 20, q: number = 0.707) {
    this.frequency = frequency;
    this.q = q;
  }
}
