import { audioctx } from "./context";
import type { EffectNode } from "./shared";

export class ChannelMergerEffect implements EffectNode {
  ctx = audioctx();
  node: ChannelMergerNode = this.ctx.createChannelMerger(2);
  bypassed: boolean = $state(false);
}
