import { audioctx, createNoiseGate } from "./context";
import type { EffectNode } from "./shared";

export class GateEffect implements EffectNode {
  ctx = audioctx();
  node: AudioWorkletNode = createNoiseGate();
  bypassed: boolean = $state(false);

  #threshold: number = $state(-30);
  set threshold(value) {
    this.#threshold = value;
    this.node.parameters
      .get("threshold")!
      .setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  get threshold() {
    return this.#threshold;
  }

  #attackTime: number = $state(0.01);
  set attack(value) {
    this.#attackTime = value;
    this.node.parameters
      .get("attackTime")!
      .setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  get attack() {
    return this.#attackTime;
  }

  #releaseTime: number = $state(0.2);
  set release(value) {
    this.#releaseTime = value;
    this.node.parameters
      .get("releaseTime")!
      .setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  get release() {
    return this.#releaseTime;
  }

  constructor(threshold = -30, attack = 0.01, release = 0.2) {
    this.threshold = threshold;
    this.attack = attack;
    this.release = release;
  }

  onmessage(callback: (data: { isOpen: boolean }) => void) {
    // FIXME: without setting .onmessage to any function
    // the addEventListener doesnt work in Brave
    this.node.port.onmessage = () => {};
    this.node.port.addEventListener("message", (event) => {
      callback(event.data);
    });
  }
}
