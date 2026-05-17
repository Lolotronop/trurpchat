import { connect, type EffectNode } from "./shared";

type EntriesArray<T extends Record<string, EffectNode>> = Array<
  [keyof T, T[keyof T]]
>;

export class EffectChain<T extends Record<string, EffectNode>> {
  nodeslist: EntriesArray<T>;

  sources: AudioNode[] = [];
  addSource(source: AudioNode) {
    this.sources.push(source);
    const input = this.nodeslist[0][1].node;
    connect(source, input);
  }

  removeSource(source: AudioNode) {
    const index = this.sources.indexOf(source);
    if (index === -1) return;
    const input = this.nodeslist[0][1].node;
    source.disconnect(input);

    if (this.sources.length > 1) {
      this.sources[index] = this.sources[this.sources.length - 1];
    }
    this.sources.pop();
  }

  sinks: AudioNode[] = [];
  addSink(sink: AudioNode) {
    this.sinks.push(sink);
    const output = this.nodeslist[this.nodeslist.length - 1][1].node;
    connect(output, sink);
  }
  removeSink(sink: AudioNode) {
    const index = this.sinks.indexOf(sink);
    if (index === -1) return;
    const output = this.nodeslist[this.nodeslist.length - 1][1].node;
    output.disconnect(sink);

    if (this.sinks.length > 1) {
      this.sinks[index] = this.sinks[this.sinks.length - 1];
    }
    this.sinks.pop();
  }

  constructor(public nodes: T) {
    this.nodeslist = Object.entries(nodes) as EntriesArray<T>;
    if (this.nodeslist.length === 0) {
      throw new Error("EffectChain must have at least one node");
    }

    for (let i = 0; i < this.nodeslist.length - 1; i++) {
      const from = this.nodeslist[i][1].node;
      const to = this.nodeslist[i + 1][1].node;
      connect(from, to);
    }
  }

  find(name: keyof T) {
    const entry = this.nodeslist.find(([k]) => k === name)!;
    const index = this.nodeslist.findIndex(([k]) => k === name);
    if (index === -1) throw new Error("Trying to access non-existent node");
    return {
      effect: entry[1],
      index,
    };
  }

  getSurrounding(index: number) {
    const prev =
      index === 0 ? this.sources : [this.nodeslist[index - 1][1].node];
    const next =
      index === this.nodeslist.length - 1
        ? this.sinks
        : [this.nodeslist[index + 1][1].node];

    return { prev, next };
  }

  bypass(name: keyof T) {
    const { effect, index } = this.find(name);
    if (effect.bypassed) return;

    effect.bypassed = true;

    if (index === 0) {
      const next = this.nodeslist[index + 1][1].node;
      this.sources.forEach((source) => {
        source.disconnect(effect.node);
        connect(source, next);
      });
    } else if (index === this.nodeslist.length - 1) {
      const prev = this.nodeslist[index - 1][1].node;
      this.sinks.forEach((sink) => {
        sink.disconnect(effect.node);
        connect(prev, sink);
      });
    } else {
      const prev = this.nodeslist[index - 1][1].node;
      const next = this.nodeslist[index + 1][1].node;
      prev.disconnect(effect.node);
      connect(prev, next);
    }
  }

  enable(name: keyof T) {
    const { effect, index } = this.find(name);
    if (!effect.bypassed) return;

    effect.bypassed = false;
    if (index === 0) {
      const next = this.nodeslist[index + 1][1].node;
      connect(effect.node, next);
      this.sources.forEach((source) => {
        source.disconnect(next);
        connect(source, effect.node);
      });
    } else if (index === this.nodeslist.length - 1) {
      const prev = this.nodeslist[index - 1][1].node;
      this.sinks.forEach((sink) => {
        prev.disconnect(sink);
        connect(effect.node, sink);
      });
      connect(prev, effect.node);
    } else {
      const prev = this.nodeslist[index - 1][1].node;
      const next = this.nodeslist[index + 1][1].node;
      prev.disconnect(next);
      connect(effect.node, next);
    }
  }

  toggle(name: keyof T) {
    const { effect: node } = this.find(name);
    if (node.bypassed) {
      this.enable(name);
    } else {
      this.bypass(name);
    }
  }
}
