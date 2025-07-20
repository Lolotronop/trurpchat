import type { God } from "./god.svelte";
import debounced from "./utils.svelte";

export const MIN_DB = -60;

export class Mic {
  c: AudioContext;
  hasPermissions: boolean = $state(false);
  stream: MediaStream | null = null;
  deviceId: string | null = $state(null);
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
      } catch (error) {
        console.error("Error disconnecting from audio context:", error);
      }
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
    this.g.settings.settings.gateThreshold = value;
    this.#gateThreshold = value;
  }
  get gateThreshold() {
    return this.#gateThreshold;
  }

  #gain: number = $state(1);
  set gain(value) {
    this.#gain = value;
    this.nodes.inputGain.gain.setTargetAtTime(value, this.c.currentTime, 0.01);
    // this.g.settings.settings.gain = value;
  }
  get gain() {
    return this.#gain;
  }

  #noiseSuppression: boolean = $state(true);
  set noiseSuppression(value) {
    this.#noiseSuppression = value;
    this.g.settings.settings.noiseSuppression = value;
    this.connect();
  }
  get noiseSuppression() {
    return this.#noiseSuppression;
  }

  #echoCancellation: boolean = $state(false);
  set echoCancellation(value) {
    this.#echoCancellation = value;

    this.g.settings.settings.echoCancellation = value;
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

  constructor(private g: God) {
    console.log("Creating audio context");
    this.c = g.c;
    this.nodes = {
      source: null,
      inputGain: this.c.createGain(),
      limiter: this.c.createDynamicsCompressor(),
      analyzer: g.createLoudnessMeter(),
      noiseGate: g.createGate(),
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
    this.nodes.noiseGate.connect(this.nodes.outputGain);
    this.nodes.outputGain.connect(this.nodes.destination);
    this.nodes.outputGain.gain.setTargetAtTime(1, this.c.currentTime, 0.01);

    this.nodes.noiseGate.connect(this.nodes.merger, 0, 0);
    this.nodes.noiseGate.connect(this.nodes.merger, 0, 1);
  }

  async init() {
    this.deviceId = this.g.settings.settings.deviceId;
    this.gain = this.g.settings.settings.gain;
    this.gateThreshold = this.g.settings.settings.gateThreshold;
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
      noiseSuppression: this.g.settings.settings.noiseSuppression,
      echoCancellation: this.g.settings.settings.echoCancellation,
      autoGainControl: false,
      channelCount: 1,
    };
    if (this.deviceId) {
      settings.deviceId = this.deviceId;
      this.g.settings.settings.deviceId = this.deviceId;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: settings,
      });
      const deviceId = this.stream.getAudioTracks()[0].getSettings().deviceId;
      this.deviceId = deviceId ?? null;
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

    this.stream = null;
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
