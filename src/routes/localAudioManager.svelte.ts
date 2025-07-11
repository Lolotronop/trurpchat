export function toDb(value: number) {
  return value === 0 ? -Infinity : 20 * Math.log10(value);
}

export function fromDb(value: number, minDb: number = -60) {
  return value === -Infinity ? 0 : Math.pow(10, value / 20);
}

export const MIN_DB = -60;

export class LocalSourceManager {
  hasPermissions: boolean = $state(false);
  private audioContext: AudioContext;
  stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private inputGainNode: GainNode;
  private limiterNode: DynamicsCompressorNode;
  private analyzerNode: AudioWorkletNode;
  private noiseGate: AudioWorkletNode;
  private outputGainNode: GainNode;
  destination: MediaStreamAudioDestinationNode;
  preferredInputDeviceId: string | null = $state(null);

  isMuted: boolean = $state(false);
  isMonitoring: boolean = $state(false);
  speaking: boolean = $state(false);

  loudnessPeakLevel: number = $state(0);
  loudnessLevel: number = $state(0);

  availableMics: MediaDeviceInfo[] = $state([]);

  controls = $state({
    inputGain: 1,
    limiterthreshold: -8,
    limiterKnee: 0,
    limiterRatio: 20,
    limiterAttack: 0.03,
    limiterRelease: 0.25,
    noiseGateThreshold: -50,
    noiseGateAttack: 0.01,
    noiseGateRelease: 0.2,
    noiseSuppression: false,
    echoCancellation: false,
  });

  constructor(
    audioContext: AudioContext,
    createGate: () => AudioWorkletNode,
    createLoudnessMeter: () => AudioWorkletNode,
  ) {
    console.log("Creating audio context");
    this.audioContext = audioContext;
    this.inputGainNode = this.audioContext.createGain();
    this.limiterNode = this.audioContext.createDynamicsCompressor();
    this.analyzerNode = createLoudnessMeter();
    this.noiseGate = createGate();
    this.destination = this.audioContext.createMediaStreamDestination();
    this.outputGainNode = this.audioContext.createGain();

    this.noiseGate.port.onmessage = (event) => {
      this.speaking = event.data.isOpen;
    };

    this.analyzerNode.port.onmessage = (event) => {
      const data = event.data;
      this.loudnessPeakLevel = data.peak;
      this.loudnessLevel = data.rms;
    };

    const eq = this.audioContext.createBiquadFilter();
    eq.type = "highpass";
    eq.frequency.setValueAtTime(20, this.audioContext.currentTime); // cutoff at 20 Hz
    eq.Q.setValueAtTime(0.707, this.audioContext.currentTime); // Butterworth (≈0.707)
    this.inputGainNode.connect(eq);
    eq.connect(this.limiterNode);
    this.limiterNode.connect(this.noiseGate);
    this.noiseGate.connect(this.outputGainNode);
    this.outputGainNode.connect(this.destination);

    $effect.root(() => {
      $effect(() => {
        if (this.isMuted) {
          this.outputGainNode.gain.setValueAtTime(
            0,
            this.audioContext.currentTime,
          );
        } else {
          this.outputGainNode.gain.setValueAtTime(
            1,
            this.audioContext.currentTime,
          );
        }
      });

      const merger = audioContext.createChannelMerger(2);

      // connect the same mono source into input 0 (left)
      this.outputGainNode.connect(merger, 0, 0);

      // connect the same mono source into input 1 (right)
      this.outputGainNode.connect(merger, 0, 1);

      $effect(() => {
        if (this.isMonitoring) {
          merger.connect(this.audioContext.destination);
        } else {
          try {
            merger.disconnect(this.audioContext.destination);
          } catch (error) {
            console.error("Error disconnecting from audio context:", error);
          }
        }
      });

      const gateThreshold = this.noiseGate.parameters.get("threshold");
      if (!gateThreshold) {
        console.error("Noise gate threshold not found");
        return;
      }
      $effect(() => {
        gateThreshold.setTargetAtTime(
          this.controls.noiseGateThreshold,
          this.audioContext.currentTime,
          0.01,
        );
      });
    });
  }

  setGain(value: number) {
    this.inputGainNode.gain.setTargetAtTime(
      value,
      this.audioContext.currentTime,
      0.01,
    );
    this.controls.inputGain = value;
  }

  async enableMic() {
    this.disableMic();
    await this.audioContext.resume();

    const settings: MediaTrackConstraints = {
      noiseSuppression: this.controls.noiseSuppression,
      echoCancellation: this.controls.echoCancellation,
      autoGainControl: false,
      channelCount: 1,
    };
    if (this.preferredInputDeviceId) {
      settings.deviceId = this.preferredInputDeviceId;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: settings,
      });
      const deviceId = this.stream.getAudioTracks()[0].getSettings().deviceId;
      this.preferredInputDeviceId = deviceId ?? null;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.sourceNode.connect(this.inputGainNode);
    } catch (error) {
      console.error("Error enabling mic:", error);
      return;
    }
  }

  disableMic() {
    this.audioContext.suspend();
    this.sourceNode?.disconnect();
    this.sourceNode = null;

    this.stream?.getAudioTracks().forEach((track) => {
      track.stop();
    });

    this.stream = null;
  }

  async getMics() {
    let devices = await navigator.mediaDevices.enumerateDevices();
    devices = devices.filter((device) => device.kind === "audioinput");
    this.availableMics = devices;
  }

  async getPermissions() {
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
    this.getMics();
  }

  enableAnalyzer() {
    this.limiterNode.disconnect(this.noiseGate);
    this.limiterNode.connect(this.analyzerNode);
    this.analyzerNode.connect(this.noiseGate);
  }

  disableAnalyzer() {
    this.analyzerNode.disconnect();
    this.limiterNode.connect(this.noiseGate);
  }
}
