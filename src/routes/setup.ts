export type MyAudioContext = {
  context: AudioContext;
  createGate: () => AudioWorkletNode;
};

export async function setupContext() {
  const context = new AudioContext();
  await context.audioWorklet.addModule("noise-gate.js");
  const createGate = () => {
    const gate = new AudioWorkletNode(context, "noise-gate");
    return gate;
  };
  return {
    context,
    createGate,
  };
}
