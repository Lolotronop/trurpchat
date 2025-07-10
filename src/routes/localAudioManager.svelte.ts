export function toDb(value: number) {
  return value === 0 ? -Infinity : 20 * Math.log10(value);
}

export function fromDb(value: number, minDb: number = -60) {
  return value === -Infinity ? 0 : Math.pow(10, value / 20);
}

export const MIN_DB = -60;

export const createLoudnessMeterHEHE = (
  analyserNode: AnalyserNode,
  FPS: number,
  callback: (rms: number, peak: number) => void,
) => {
  const PEAK_DECAY = 0.9;
  let heldPeak = 0;
  const SMOOTHING_ALPHA = 0.8;
  let smoothedRms = 0;
  const FRAMERATE = FPS;
  let prevSize = 0;
  let timeDomainData = new Float32Array(128);
  let loudnessPeakLevel = $state(0);
  let loudnessLevel = $state(0);
  // @ts-ignore
  const interval = setInterval(() => {
    const bufferLength = analyserNode.fftSize;
    if (bufferLength !== prevSize) {
      prevSize = bufferLength;
      timeDomainData = new Float32Array(bufferLength);
    }
    analyserNode.getFloatTimeDomainData(timeDomainData);

    let instantPeak = 0;
    for (let i = 0; i < bufferLength; i++) {
      const absVal = Math.abs(timeDomainData[i]);
      if (absVal > instantPeak) instantPeak = absVal;
    }

    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      sumSquares += timeDomainData[i] * timeDomainData[i];
    }
    const instantRms = Math.sqrt(sumSquares / bufferLength);

    smoothedRms =
      SMOOTHING_ALPHA * smoothedRms + (1 - SMOOTHING_ALPHA) * instantRms;

    heldPeak = Math.max(instantPeak, heldPeak * PEAK_DECAY);
    const heldPeakDb = toDb(heldPeak);
    loudnessPeakLevel = Math.max(0, -MIN_DB + heldPeakDb);

    loudnessLevel = Math.max(0, -MIN_DB + toDb(smoothedRms));
    callback(loudnessLevel, loudnessPeakLevel);
  }, 1000 / FRAMERATE);

  return {
    interval,
  };
};

export class LocalSourceManager {
  hasPermissions: boolean = $state(false);
  private audioContext: AudioContext;
  stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private inputGainNode: GainNode;
  private limiterNode: DynamicsCompressorNode;
  private analyserNode: AudioWorkletNode;
  private noiseGate: AudioWorkletNode;
  private outputGainNode: GainNode;
  destination: MediaStreamAudioDestinationNode;
  private preferredInputDeviceId: string | null = null;

  isMuted: boolean = $state(false);

  loudnessPeakLevel: number = $state(0);
  loudnessLevel: number = $state(0);

  availableMics: MediaDeviceInfo[] = $state([]);

  controls = $state({
    inputGain: 1,
    limiterthreshold: -24,
    limiterKnee: 30,
    limiterRatio: 12,
    limiterAttack: 0.003,
    limiterRelease: 0.25,
    noiseGateThreshold: -50,
    noiseGateAttack: 0.3,
    noiseGateRelease: 0.4,
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
    this.analyserNode = createLoudnessMeter();
    this.noiseGate = createGate();
    this.destination = this.audioContext.createMediaStreamDestination();
    this.outputGainNode = this.audioContext.createGain();

    this.inputGainNode.connect(this.limiterNode);
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
    });
  }

  setGain(value: number) {
    this.inputGainNode.gain.setValueAtTime(
      value,
      this.audioContext.currentTime,
    );
    this.controls.inputGain = value;
  }

  async enableMic() {
    this.disableMic();
    await this.audioContext.resume();

    const settings: MediaStreamConstraints = {
      audio: {
        noiseSuppression: this.controls.noiseSuppression,
        echoCancellation: this.controls.echoCancellation,
        autoGainControl: false,
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(settings);
      console.log("set stream to something");
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
    console.log("set stream to nothing");
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

  // TODO: Move to a worklet
  enableAnalyzer() {
    this.analyserNode.port.onmessage = (event) => {
      const data = event.data;
      this.loudnessPeakLevel = data.peak;
      this.loudnessLevel = data.rms;
    };

    this.limiterNode.disconnect(this.noiseGate);
    this.limiterNode.connect(this.analyserNode);
    this.analyserNode.connect(this.noiseGate);
  }

  disableAnalyzer() {
    this.analyserNode.disconnect();
    this.limiterNode.connect(this.noiseGate);
  }
}
