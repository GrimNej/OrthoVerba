import type { AudioTelemetry } from "../../domain/audio/types";

export interface AudioTelemetryPort {
  start(stream: MediaStream, callback: (telemetry: AudioTelemetry) => void): Promise<void>;
  stop(): Promise<void>;
}
