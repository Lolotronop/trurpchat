import { AnalyzerEffect } from "./audio/analyzer.svelte";
import { EffectChain } from "./audio/chain.svelte";
import { CompressorEffect } from "./audio/compressor.svelte";
import { audioctx } from "./audio/context";
import { GainEffect } from "./audio/gain.svelte";
import { GateEffect } from "./audio/gate.svelte";
import { ChannelMergerEffect } from "./audio/merger.svelte";
import { sound } from "./sound.svelte";
import { debounce } from "./utils.svelte";
import { getPlatformStore, type IPersistantStore } from "./webstore";

export class Mic {
  ctx: AudioContext = audioctx();
  store: IPersistantStore = getPlatformStore("mic");
  persistGain = debounce((value) => this.store.set("gain", value));
  hasPermissions: boolean = $state(false);
  stream: MediaStream | undefined = undefined;
  deviceId: string | undefined = $state(undefined);
  private speakingListeners = new Set<(speaking: boolean) => void>();

  private source: MediaStreamAudioSourceNode | null = null;
  effects = new EffectChain({
    gain: new GainEffect(),
    limiter: new CompressorEffect({
      threshold: -8,
      knee: 0,
      ratio: 20,
      attack: 0.03,
      release: 0.2,
    }),
    gate: new GateEffect(),
    pushToTalkGain: new GainEffect(),
    merger: new ChannelMergerEffect(),
    mute: new GainEffect(),
  });
  analyzer = new AnalyzerEffect();
  output = this.ctx.createMediaStreamDestination();

  #monitoring: boolean = $state(false);
  get monitoring() {
    return this.#monitoring;
  }
  set monitoring(value) {
    this.#monitoring = value;
    const node = this.effects.nodes.merger.node;
    if (value) {
      node.connect(this.ctx.destination);
      return;
    }

    try {
      node.disconnect(this.ctx.destination);
    } catch (err) {
      err;
      // TODO: filter out the "not connected" error,
      // we just silence the error because we blanket disconnect
      // it with no regard for whether it was connected previosly
      // or not. and if it wasnt it would error out
    }
  }

  #noiseSuppression: boolean = $state(true);
  set noiseSuppression(value) {
    this.#noiseSuppression = value;
    this.store.set("noiseSuppression", value);
    this.enable();
  }
  get noiseSuppression() {
    return this.#noiseSuppression;
  }

  #echoCancellation: boolean = $state(false);
  set echoCancellation(value) {
    this.#echoCancellation = value;

    this.store.set("echoCancellation", value);
    this.enable();
  }
  get echoCancellation() {
    return this.#echoCancellation;
  }

  #muted: boolean = $state(false);
  set muted(value) {
    this.#muted = value;
    this.store.set("muted", value);
    this.effects.nodes.mute.muted = value;
  }
  get muted() {
    return this.#muted;
  }

  #isPushToTalk: boolean = $state(false);
  set isPushToTalk(value) {
    this.#isPushToTalk = value;
    this.store.set("isPushToTalk", value);
    this.applyInputMode();
  }
  get isPushToTalk() {
    return this.#isPushToTalk;
  }

  #playPttSound: boolean = $state(false);
  set playPttSound(value) {
    this.#playPttSound = value;
    this.store.set("playPttSound", value);
  }
  get playPttSound() {
    return this.#playPttSound;
  }

  get gain() {
    return this.effects.nodes.gain.gain;
  }
  set gain(value) {
    this.effects.nodes.gain.gain = value;
    this.persistGain(value);
  }

  get threshold() {
    return this.effects.nodes.gate.threshold;
  }
  set threshold(value) {
    this.effects.nodes.gate.threshold = value;
    this.store.set("gateThreshold", value);
  }

  speaking: boolean = $state(false);
  #pushToTalkActive: boolean = $state(false);

  peak: number = $state(0);
  rms: number = $state(0);

  devices: MediaDeviceInfo[] = $state([]);

  constructor() {
    this.effects.nodes.gate.onmessage(({ isOpen }) => {
      if (!this.isPushToTalk) {
        this.setSpeaking(isOpen);
      }
    });

    this.analyzer.onmessage(({ rms, peak }) => {
      this.peak = peak;
      this.rms = rms;
    });

    this.effects.addSink(this.output);

    this.init();
  }

  async init() {
    this.deviceId = await this.store.get("deviceId");
    this.muted = (await this.store.get("muted")) || false;
    this.#isPushToTalk = (await this.store.get("isPushToTalk")) || false;
    this.#playPttSound = (await this.store.get("playPttSound")) || true;
    this.effects.nodes.gain.gain = (await this.store.get("gain")) || 1;
    this.effects.nodes.gate.threshold =
      (await this.store.get("gateThreshold")) || -30;
    this.applyInputMode();

    this.hasPermissions = true;
    this.updateDevices();
  }

  async enable(exact = true) {
    this.disable();
    await this.ctx.resume();

    const settings: MediaTrackConstraints = {
      noiseSuppression: (await this.store.get("noiseSuppression")) ?? true,
      echoCancellation: (await this.store.get("echoCancellation")) ?? false,
      autoGainControl: false,
      channelCount: 1,
    };

    if (this.deviceId) {
      settings.deviceId = exact ? { exact: this.deviceId } : this.deviceId;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: settings,
      });
      const track = this.stream.getAudioTracks()[0];
      if (!track) {
        throw new Error("The audio track for the mic is not there!");
      }
      const deviceId = track.getSettings().deviceId;
      this.deviceId = deviceId;
      this.store.set("deviceId", this.deviceId);
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.effects.addSource(this.source);
    } catch (error) {
      if (error instanceof OverconstrainedError && exact) {
        await this.enable(false);
        return;
      }

      console.error("Error enabling mic:", error);
      return;
    }
  }

  disable() {
    this.source && this.effects.removeSource(this.source);
    this.source = null;

    this.stream?.getAudioTracks().forEach((track) => {
      track.stop();
    });

    this.stream = undefined;
  }

  async updateDevices() {
    let devices = await navigator.mediaDevices.enumerateDevices();
    devices = devices.filter((device) => device.kind === "audioinput");
    this.devices = devices;
  }

  enableAnalyzer() {
    this.effects.nodes.limiter.node.connect(this.analyzer.node);
  }

  disableAnalyzer() {
    try {
      this.effects.nodes.limiter.node.disconnect(this.analyzer.node);
    } catch (err) {
      // TODO: filter out the "not connected" error,
      // log the rest
      console.warn("Could not disconnect analyzer", err);
    }
  }

  setPushToTalkActive(active: boolean) {
    this.#pushToTalkActive = active;
    if (!this.isPushToTalk) return;
    this.effects.nodes.pushToTalkGain.gain = active ? 1 : 0;
    this.setSpeaking(active);
    if (!this.#playPttSound || this.#muted) return;
    sound.play(active ? "ptt activate" : "ptt deactivate");
  }

  onSpeakingChange(callback: (speaking: boolean) => void) {
    this.speakingListeners.add(callback);
    return () => {
      this.speakingListeners.delete(callback);
    };
  }

  private setSpeaking(value: boolean) {
    if (this.speaking === value) return;
    this.speaking = value;
    for (const callback of this.speakingListeners) {
      callback(value);
    }
  }

  private applyInputMode() {
    if (this.isPushToTalk) {
      this.effects.bypass("gate");
      this.effects.nodes.pushToTalkGain.gain = this.#pushToTalkActive ? 1 : 0;
      this.setSpeaking(this.#pushToTalkActive);
      return;
    }

    this.effects.enable("gate");
    this.effects.nodes.pushToTalkGain.gain = 1;
    this.setSpeaking(false);
  }
}
