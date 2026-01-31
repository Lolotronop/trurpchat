import { audioctx } from "./context";
import type { EffectNode } from "./shared";

export class CompressorEffect implements EffectNode {
  ctx = audioctx();
  node = this.ctx.createDynamicsCompressor();
  bypassed: boolean = $state(false);

  #threshold: number = $state(-24);
  set threshold(value) {
    this.#threshold = value;
    this.node.threshold.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  get threshold() {
    return this.#threshold;
  }

  #knee: number = $state(30);
  set knee(value) {
    this.#knee = value;
    this.node.knee.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  get knee() {
    return this.#knee;
  }

  #ratio: number = $state(12);
  set ratio(value) {
    this.#ratio = value;
    this.node.ratio.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  get ratio() {
    return this.#ratio;
  }

  #attack: number = $state(0.003);
  set attack(value) {
    this.#attack = value;
    this.node.attack.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  get attack() {
    return this.#attack;
  }

  #release: number = $state(0.25);
  set release(value) {
    this.#release = value;
    this.node.release.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  get release() {
    return this.#release;
  }

  constructor(
    params: {
      threshold?: number;
      knee?: number;
      ratio?: number;
      attack?: number;
      release?: number;
    } = {},
  ) {
    if (params.threshold) this.threshold = params.threshold;
    if (params.knee) this.knee = params.knee;
    if (params.ratio) this.ratio = params.ratio;
    if (params.attack) this.attack = params.attack;
    if (params.release) this.release = params.release;
  }
}
