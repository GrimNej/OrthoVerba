export interface AudioTelemetry {
  readonly rms: number;
  readonly peak: number;
  readonly clippingRatio: number;
  readonly speechActive: boolean;
  readonly receivedAtMainMs: number;
}
