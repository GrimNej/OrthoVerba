import type { CursorResult } from "../../domain/alignment/types";
import type { ParsedScript } from "../../domain/script/types";
import type { AudioTelemetry } from "../../domain/audio/types";
import type { RecognitionPort } from "../ports/recognition-port";
import type { MicrophonePort } from "../ports/microphone-port";
import type { AudioTelemetryPort } from "../ports/audio-telemetry-port";
import { TrackingWorkerClient } from "../../infrastructure/tracking/tracking-worker-client";

export type EnginePhase = "idle" | "preparing" | "ready" | "starting" | "listening" | "paused" | "error";

export interface ReaderEngineCallbacks {
  readonly onPhase: (phase: EnginePhase, message: string) => void;
  readonly onParsed: (parsed: ParsedScript) => void;
  readonly onCursor: (cursor: CursorResult) => void;
  readonly onTelemetry: (telemetry: AudioTelemetry) => void;
  readonly onError: (message: string) => void;
}

export class ReaderEngine {
  readonly #recognition: RecognitionPort;
  readonly #microphone: MicrophonePort;
  readonly #telemetry: AudioTelemetryPort;
  readonly #callbacks: ReaderEngineCallbacks;
  readonly #worker: TrackingWorkerClient;
  #prepared = false;
  #locale = "en-US";

  constructor(
    recognition: RecognitionPort,
    microphone: MicrophonePort,
    telemetry: AudioTelemetryPort,
    callbacks: ReaderEngineCallbacks,
  ) {
    this.#recognition = recognition;
    this.#microphone = microphone;
    this.#telemetry = telemetry;
    this.#callbacks = callbacks;
    this.#worker = new TrackingWorkerClient({
      onReady: (parsed) => {
        this.#prepared = true;
        callbacks.onParsed(parsed);
        callbacks.onPhase("ready", `Prepared ${parsed.tokens.length.toLocaleString()} words.`);
      },
      onResult: callbacks.onCursor,
      onError: (message) => {
        callbacks.onError(message);
        callbacks.onPhase("error", message);
      },
    });
  }

  get recognitionSupported(): boolean {
    return this.#recognition.supported;
  }

  get recognitionMode(): string {
    return this.#recognition.mode;
  }

  prepare(sourceText: string, locale: string): void {
    if (sourceText.trim().length === 0) throw new Error("Paste a script first.");
    this.stop();
    this.#prepared = false;
    this.#locale = locale;
    this.#callbacks.onPhase("preparing", "Building the script index…");
    this.#worker.initialize(sourceText, locale);
  }

  async start(): Promise<void> {
    if (!this.#prepared) throw new Error("Prepare the script before listening.");
    if (!this.#recognition.supported) throw new Error("Voice recognition is unavailable in this browser.");
    this.#callbacks.onPhase("starting", "Opening the microphone…");
    try {
      const stream = await this.#microphone.open();
      this.#callbacks.onPhase("starting", "Starting microphone telemetry…");
      await this.#telemetry.start(stream, this.#callbacks.onTelemetry);
      this.#worker.beginSession();
      this.#callbacks.onPhase("starting", "Starting browser speech recognition…");
      this.#recognition.start(this.#locale, {
        onSnapshot: (snapshot) => this.#worker.track(snapshot),
        onStarted: () => this.#callbacks.onPhase("listening", "Listening — read naturally."),
        onStopped: () => undefined,
        onError: (message, fatal) => {
          this.#callbacks.onError(message);
          if (fatal) {
            this.stop();
            this.#callbacks.onPhase("error", message);
          }
        },
      });
    } catch (error: unknown) {
      await this.#telemetry.stop();
      this.#microphone.close();
      const message = error instanceof Error ? error.message : "Unable to start the reader.";
      this.#callbacks.onError(message);
      this.#callbacks.onPhase("error", message);
      throw error;
    }
  }

  pause(): void {
    this.#recognition.stop();
    void this.#telemetry.stop();
    this.#microphone.close();
    this.#callbacks.onPhase("paused", "Paused — microphone released.");
  }

  stop(): void {
    this.#recognition.stop();
    void this.#telemetry.stop();
    this.#microphone.close();
    this.#callbacks.onPhase(this.#prepared ? "ready" : "idle", this.#prepared ? "Ready." : "Paste a script to begin.");
  }

  reanchor(boundary: number): void {
    this.#worker.reanchor(boundary);
  }

  dispose(): void {
    this.stop();
    this.#worker.dispose();
    this.#recognition.dispose();
  }
}
