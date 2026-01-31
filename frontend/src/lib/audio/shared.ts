export interface EffectNode {
  node: AudioNode | AudioWorkletNode;
  bypassed: boolean;
}

export function connect(source: AudioNode, target: AudioNode) {
  if (target instanceof ChannelMergerNode) {
    source.connect(target, 0, 0);
    source.connect(target, 0, 1);
  }
  source.connect(target);
}
