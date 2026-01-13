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
  return new AudioWorkletNode(getAudioContext(), "loudness");
};

export const createNoiseGate = () => {
  return new AudioWorkletNode(getAudioContext(), "noise-gate");
};
