let context: AudioContext | null;

export const getAudioContext = () => {
  if (!context) {
    context = new AudioContext();
  }
  return context;
};

export async function initCustomModules() {
  const promises = [
    getAudioContext().audioWorklet.addModule("loudness.js"),
    getAudioContext().audioWorklet.addModule("noise-gate.js"),
  ];
  await Promise.all(promises);
}

export const createLoudnessAnalyzer = () => {
  const loudness = new AudioWorkletNode(getAudioContext(), "loudness");
  loudness.connect(getAudioContext().destination);
  return loudness;
};

export const createNoiseGate = () => {
  const noiseGate = new AudioWorkletNode(getAudioContext(), "noise-gate");
  noiseGate.connect(getAudioContext().destination);
  return noiseGate;
};
