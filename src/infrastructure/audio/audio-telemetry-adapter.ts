import type { AudioTelemetryPort } from "../../application/ports/audio-telemetry-port";
import type { AudioTelemetry } from "../../domain/audio/types";
import workletUrl from "./audio-telemetry-processor.ts?worker&url";

interface WorkletMessage {
  readonly type: "TELEMETRY";
  readonly rms: number;
  readonly peak: number;
  readonly clippingRatio: number;
  readonly speechActive: boolean;
}

export class BrowserAudioTelemetryAdapter implements AudioTelemetryPort {
  #context: AudioContext | null = null;
  #source: MediaStreamAudioSourceNode | null = null;
  #node: AudioWorkletNode | null = null;

  async start(stream: MediaStream, callback: (telemetry: AudioTelemetry) => void): Promise<void> {
    await this.stop();
    const context = new AudioContext({ latencyHint: "interactive" });
    await context.audioWorklet.addModule(workletUrl);
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "orthoverba-telemetry", { numberOfInputs: 1, numberOfOutputs: 0 });
    node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      const value = event.data;
      if (value.type !== "TELEMETRY") return;
      callback({
        rms: Math.max(0, Math.min(1, value.rms)),
        peak: Math.max(0, Math.min(1, value.peak)),
        clippingRatio: Math.max(0, Math.min(1, value.clippingRatio)),
        speechActive: value.speechActive,
        receivedAtMainMs: performance.now(),
      });
    };
    source.connect(node);
    this.#context = context;
    this.#source = source;
    this.#node = node;
  }

  async stop(): Promise<void> {
    this.#node?.disconnect();
    this.#source?.disconnect();
    this.#node = null;
    this.#source = null;
    const context = this.#context;
    this.#context = null;
    if (context !== null && context.state !== "closed") await context.close();
  }
}
