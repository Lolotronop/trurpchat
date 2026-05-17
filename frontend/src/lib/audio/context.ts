let context: AudioContext | null;

export const audioctx = () => {
  if (!context) {
    context = new AudioContext();
  }
  return context;
};

export async function initCustomModules() {
  const promises = [
    audioctx().audioWorklet.addModule("loudness.js"),
    audioctx().audioWorklet.addModule("noise-gate.js"),
  ];
  await Promise.all(promises);
}

export const createLoudnessAnalyzer = () => {
  return new AudioWorkletNode(audioctx(), "loudness");
};

export const createNoiseGate = () => {
  return new AudioWorkletNode(audioctx(), "noise-gate");
};
