class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "threshold",
        defaultValue: -50,
        minValue: -100,
        maxValue: 0,
        automationRate: "k-rate",
      },
      {
        name: "attackTime",
        defaultValue: 0.01,
        minValue: 0.001,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "releaseTime",
        defaultValue: 0.2,
        minValue: 0.01,
        maxValue: 2,
        automationRate: "k-rate",
      },
    ];
  }
  constructor() {
    super();
    this._gain = 1;
    this._prevIsOpen = false;
  }
  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !output || !input[0] || !output[0]) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    // Grab the threshold value for this block
    const threshDB = params.threshold[0];
    const threshLin = Math.pow(10, threshDB / 20);

    // Get attack and release times
    const attackTime = params.attackTime[0];
    const releaseTime = params.releaseTime[0];

    // Compute RMS of the input
    let sumSq = 0;
    for (let i = 0; i < inputChannel.length; i++) {
      sumSq += inputChannel[i] * inputChannel[i];
    }
    const rms = Math.sqrt(sumSq / inputChannel.length);

    // Decide whether to open (1) or close (0) gate
    const target = rms >= threshLin ? 1 : 0;

    // Calculate step size per block (multiply by block size)
    const attackStep = inputChannel.length / (attackTime * sampleRate);
    const releaseStep = inputChannel.length / (releaseTime * sampleRate);

    const oldGain = this._gain;

    // Apply simple linear interpolation for predictable timing
    if (target > this._gain) {
      // Opening gate - use attack step
      this._gain = Math.min(1, this._gain + attackStep);
    } else if (target < this._gain) {
      // Closing gate - use release step
      this._gain = Math.max(0, this._gain - releaseStep);
    }

    // Apply gain to audio and output
    for (let i = 0; i < inputChannel.length; i++) {
      outputChannel[i] = inputChannel[i] * this._gain;
    }

    // Send gate state changes only
    const isOpen = this._gain > 0.1;
    if (isOpen !== this._prevIsOpen) {
      this.port.postMessage({ isOpen });
      this._prevIsOpen = isOpen;
    }

    return true;
  }
}
registerProcessor("noise-gate", NoiseGateProcessor);
