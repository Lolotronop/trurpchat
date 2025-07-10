// loudness-processor.js
class LoudnessProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const {
      processorOptions: {
        smoothingAlpha = 0.8,
        peakDecay = 0.9,
        minDb = -60,
        fps = 60,
      } = {},
    } = options;

    this._smoothingAlpha = smoothingAlpha;
    this._peakDecay = peakDecay;
    this._minDb = minDb;

    // how many samples make up one window
    this._samplesPerWindow = sampleRate / fps;
    this._sampleCounter = 0;

    // window accumulators
    this._windowPeak = 0;
    this._windowRmsSum = 0;
    this._windowRmsCount = 0;

    // smoothed state
    this._smoothedRms = 0;
    this._heldPeak = 0;
  }

  static toDb(v) {
    return 20 * Math.log10(Math.max(v, 1e-20));
  }

  process(inputs, outputs) {
    const inChannels = inputs[0];
    const outChannels = outputs[0];
    if (!inChannels || inChannels.length === 0) {
      return true;
    }
    for (let ch = 0; ch < inChannels.length; ch++) {
      const inputChannel = inChannels[ch];
      const outputChannel = outChannels[ch];
      outputChannel.set(inputChannel);
    }

    const channelData = inChannels[0];
    let sumSquares = 0;
    let instantPeak = 0;

    // compute this quantum's instant RMS & peak
    for (let i = 0; i < channelData.length; i++) {
      const x = channelData[i];
      const ax = Math.abs(x);
      sumSquares += x * x;
      if (ax > instantPeak) instantPeak = ax;
    }
    const instantRms = Math.sqrt(sumSquares / channelData.length);

    // accumulate into our window
    this._windowPeak = Math.max(this._windowPeak, instantPeak);
    this._windowRmsSum += instantRms;
    this._windowRmsCount++;

    this._sampleCounter += channelData.length;

    // if we've filled one window → report & reset
    if (this._sampleCounter >= this._samplesPerWindow) {
      // average RMS over window
      const windowRmsAvg = this._windowRmsSum / this._windowRmsCount;

      // smooth window RMS
      this._smoothedRms =
        this._smoothingAlpha * this._smoothedRms +
        (1 - this._smoothingAlpha) * windowRmsAvg;

      // decay held peak once per window, then max with window peak
      this._heldPeak = Math.max(
        this._windowPeak,
        this._heldPeak * this._peakDecay,
      );

      // convert to dB and normalize above minDb
      const peakDb = LoudnessProcessor.toDb(this._heldPeak);
      const rmsDb = LoudnessProcessor.toDb(this._smoothedRms);
      const peak = Math.max(0, -this._minDb + peakDb);
      const rms = Math.max(0, -this._minDb + rmsDb);

      // post the windowed result
      this.port.postMessage({ rms, peak });

      // subtract overshoot, reset accumulators
      this._sampleCounter -= this._samplesPerWindow;
      this._windowPeak = 0;
      this._windowRmsSum = 0;
      this._windowRmsCount = 0;
    }

    return true;
  }
}

registerProcessor("loudness", LoudnessProcessor);
