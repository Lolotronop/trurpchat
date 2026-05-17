import { createLoudnessAnalyzer } from "./context";
import type { EffectNode } from "./shared";

type AnalyzerCallback = (data: { rms: number; peak: number }) => void;
export class AnalyzerEffect implements EffectNode {
  node: AudioWorkletNode = createLoudnessAnalyzer();
  bypassed: boolean = $state(false);

  constructor(callback?: AnalyzerCallback) {
    callback && this.onmessage(callback);
  }

  onmessage(callback: AnalyzerCallback) {
    // FIXME: without setting .onmessage to any function
    // the addEventListener doesnt work in Brave
    this.node.port.onmessage = () => {};
    this.node.port.addEventListener("message", (event) => {
      callback(event.data);
    });
  }
}
