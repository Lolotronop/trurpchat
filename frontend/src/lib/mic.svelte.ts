import {
  createLoudnessAnalyzer,
  createNoiseGate,
  getAudioContext,
} from "./audiocontext";
import { getPlatformStore, type IPersistantStore } from "./webstore";

export const MIN_DB = -60;

export class Mic {
  c: AudioContext;
  store: IPersistantStore;
  hasPermissions: boolean = $state(false);
  stream: MediaStream | undefined = undefined;
  deviceId: string | undefined = $state(undefined);
  nodes: {
    source: MediaStreamAudioSourceNode | null;
    inputGain: GainNode;
    limiter: DynamicsCompressorNode;
    analyzer: AudioWorkletNode;
    noiseGate: AudioWorkletNode;
    outputGain: GainNode;
    destination: MediaStreamAudioDestinationNode;
    merger: ChannelMergerNode;
  };

  #monitoring: boolean = $state(false);
  get monitoring() {
    return this.#monitoring;
  }
  set monitoring(value) {
    this.#monitoring = value;
    const node = this.nodes.merger;
    if (value) {
      node.connect(this.c.destination);
    } else {
      try {
        node.disconnect(this.c.destination);
        // we just silence the error because we blanket disconnect
        // it with no regard for whether it was connected previosly
        // or not. and if it wasnt it would error out
      } catch (_) { }
    }
  }

  #gateThreshold: number = $state(-30);
  set gateThreshold(value) {
    const gateThreshold = this.nodes.noiseGate.parameters.get("threshold");
    if (!gateThreshold) {
      console.error("Noise gate threshold not found");
      return;
    }
    gateThreshold.setTargetAtTime(value, this.c.currentTime, 0.01);
    this.store.set("gateThreshold", value);
    this.#gateThreshold = value;
  }
  get gateThreshold() {
    return this.#gateThreshold;
  }

  #gain: number = $state(1);
  set gain(value) {
    this.#gain = value;
    this.nodes.inputGain.gain.setTargetAtTime(value, this.c.currentTime, 0.01);
    this.store.set("gain", value);
  }
  get gain() {
    return this.#gain;
  }

  #noiseSuppression: boolean = $state(true);
  set noiseSuppression(value) {
    this.#noiseSuppression = value;
    this.store.set("noiseSuppression", value);
    this.connect();
  }
  get noiseSuppression() {
    return this.#noiseSuppression;
  }

  #echoCancellation: boolean = $state(false);
  set echoCancellation(value) {
    this.#echoCancellation = value;

    this.store.set("echoCancellation", value);
    this.connect();
  }
  get echoCancellation() {
    return this.#echoCancellation;
  }

  speaking: boolean = $state(false);

  peak: number = $state(0);
  rms: number = $state(0);

  devices: MediaDeviceInfo[] = $state([]);

  controls = $state({
    limiterthreshold: -8,
    limiterKnee: 0,
    limiterRatio: 20,
    limiterAttack: 0.03,
    limiterRelease: 0.25,
    noiseGateAttack: 0.01,
    noiseGateRelease: 0.2,
  });

  constructor() {
    this.store = getPlatformStore("mic.json");

    this.c = getAudioContext();
    this.nodes = {
      source: null,
      inputGain: this.c.createGain(),
      limiter: this.c.createDynamicsCompressor(),
      analyzer: createLoudnessAnalyzer(),
      noiseGate: createNoiseGate(),
      outputGain: this.c.createGain(),
      destination: this.c.createMediaStreamDestination(),
      merger: this.c.createChannelMerger(2),
    };

    this.nodes.limiter.threshold.setValueAtTime(-8, this.c.currentTime);
    this.nodes.limiter.knee.setValueAtTime(0, this.c.currentTime);
    this.nodes.limiter.ratio.setValueAtTime(20, this.c.currentTime);
    this.nodes.limiter.attack.setValueAtTime(0.03, this.c.currentTime);
    this.nodes.limiter.release.setValueAtTime(0.2, this.c.currentTime);

    this.nodes.noiseGate.port.onmessage = (event) => {
      this.speaking = event.data.isOpen;
    };

    this.nodes.analyzer.port.onmessage = (event) => {
      const data = event.data;
      this.peak = data.peak;
      this.rms = data.rms;
    };

    const eq = this.c.createBiquadFilter();
    eq.type = "highpass";
    eq.frequency.setValueAtTime(20, this.c.currentTime); // cutoff at 20 Hz
    eq.Q.setValueAtTime(0.707, this.c.currentTime); // Butterworth (≈0.707)
    this.nodes.inputGain.connect(eq);
    eq.connect(this.nodes.limiter);
    this.nodes.limiter.connect(this.nodes.noiseGate);
    // this.nodes.noiseGate.connect(this.nodes.outputGain);

    this.nodes.noiseGate.connect(this.nodes.merger, 0, 0);
    this.nodes.noiseGate.connect(this.nodes.merger, 0, 1);

    this.nodes.merger.connect(this.nodes.outputGain);

    this.nodes.outputGain.connect(this.nodes.destination);
    this.nodes.outputGain.gain.setTargetAtTime(1, this.c.currentTime, 0.01);

    this.init();
  }

  async init() {
    this.deviceId = await this.store.get("deviceId");
    this.gain = (await this.store.get("gain")) || 1;
    this.gateThreshold = (await this.store.get("gateThreshold")) || -30;
    try {
      let media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      media.getTracks().forEach((track) => {
        track.stop();
      });
      // @ts-ignore
      media = null;
    } catch (error) {
      console.error("Error getting permissions:", error);
      this.hasPermissions = false;
    }

    this.hasPermissions = true;
    this.updateDevices();
  }

  async connect() {
    this.disconnect();
    await this.c.resume();

    const settings: MediaTrackConstraints = {
      noiseSuppression: (await this.store.get("noiseSuppression")) || true,
      echoCancellation: (await this.store.get("echoCancellation")) || false,
      autoGainControl: false,
      channelCount: 1,
    };

    if (this.deviceId) {
      console.log("Before:", this.deviceId);
      settings.deviceId = this.deviceId;
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
      console.log("After:", deviceId)
      this.deviceId = deviceId;
      this.store.set("deviceId", this.deviceId);
      this.nodes.source = this.c.createMediaStreamSource(this.stream);
      this.nodes.source.connect(this.nodes.inputGain);
    } catch (error) {
      console.error("Error enabling mic:", error);
      return;
    }
  }

  disconnect() {
    this.nodes.source?.disconnect();
    this.nodes.source = null;

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
    this.nodes.limiter.connect(this.nodes.analyzer);
  }

  disableAnalyzer() {
    this.nodes.analyzer.disconnect();
  }
}
