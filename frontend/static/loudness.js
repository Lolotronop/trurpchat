// loudness-processor.js
class LoudnessProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const {
      processorOptions: { peakDecay = 0.8, minDb = -60, fps = 30 } = {},
    } = options;

    this._peakDecay = peakDecay;
    this._minDb = minDb;

    // how many samples make up one window
    this._samplesPerWindow = sampleRate / fps;
    this._sampleCounter = 0;

    // window accumulators
    this._windowPeak = 0;
    this._windowRmsMax = 0;

    // smoothed state
    this._smoothedRms = 0;
    this._heldPeak = 0;
  }

  static toDb(v) {
    return 20 * Math.log10(Math.max(v, 1e-8));
  }

  process(inputs, outputs) {
    const inChannels = inputs[0];
    const outChannels = outputs[0];

    if (!inChannels || inChannels.length === 0) {
      return true;
    }

    const inputChannel = inChannels[0];
    let sumSquares = 0;
    let instantPeak = 0;

    for (let i = 0; i < inputChannel.length; i++) {
      const x = inputChannel[i];
      const ax = Math.abs(x);
      sumSquares += x * x;
      if (ax > instantPeak) instantPeak = ax;
    }
    const instantRms = Math.sqrt(sumSquares / inputChannel.length);

    if (instantRms > this._windowRmsMax) this._windowRmsMax = instantRms;
    if (instantPeak > this._windowPeak) {
      this._windowPeak = instantPeak;
    }
    this._sampleCounter += inputChannel.length;

    for (let ch = 0; ch < inChannels.length; ch++) {
      outChannels[ch].set(inChannels[ch]);
    }

    if (this._sampleCounter >= this._samplesPerWindow) {
      let thing = this._smoothedRms * this._peakDecay;
      this._smoothedRms = Math.max(this._windowRmsMax, thing);

      // Decay the previous peak, then compare with window's max
      this._heldPeak = Math.max(
        this._windowPeak,
        this._heldPeak * this._peakDecay,
      );

      // Convert to dB
      const rmsDb = LoudnessProcessor.toDb(this._smoothedRms);
      const peakDb = LoudnessProcessor.toDb(this._heldPeak);

      // Normalize above minDb
      const rms = Math.min(0, rmsDb);
      const peak = Math.min(0, peakDb);

      // Send it to the main thread
      this.port.postMessage({ rms, peak });

      // Reset window accumulators, carry over any extra samples
      this._sampleCounter -= this._samplesPerWindow;
      this._windowRmsMax = 0;
      this._windowPeak = 0;
    }

    return true;
  }
}

registerProcessor("loudness", LoudnessProcessor);
