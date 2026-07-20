class OrthoVerbaTelemetryProcessor extends AudioWorkletProcessor {
  #frames = 0;
  #speechActive = false;
  #noiseFloor = 0.01;

  process(inputs: Float32Array[][]): boolean {
    const samples = inputs[0]?.[0];
    if (samples === undefined || samples.length === 0) return true;
    let sum = 0;
    let peak = 0;
    let clipped = 0;
    for (const sample of samples) {
      sum += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
      if (Math.abs(sample) > 0.98) clipped += 1;
    }
    const rms = Math.sqrt(sum / samples.length);
    this.#noiseFloor = this.#speechActive
      ? this.#noiseFloor * 0.999 + rms * 0.001
      : this.#noiseFloor * 0.98 + rms * 0.02;
    const enter = Math.max(0.018, this.#noiseFloor * 2.6);
    const exit = Math.max(0.012, this.#noiseFloor * 1.6);
    this.#speechActive = this.#speechActive ? rms > exit : rms > enter;
    this.#frames += samples.length;
    const reportEvery = Math.max(1, Math.floor(sampleRate / 20));
    if (this.#frames >= reportEvery) {
      this.#frames = 0;
      this.port.postMessage({
        type: "TELEMETRY",
        rms,
        peak,
        clippingRatio: clipped / samples.length,
        speechActive: this.#speechActive,
      });
    }
    return true;
  }
}

registerProcessor("orthoverba-telemetry", OrthoVerbaTelemetryProcessor);
