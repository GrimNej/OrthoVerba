import { ReaderEngine, type ReaderEngineCallbacks } from "../application/reader/reader-engine";
import { BrowserMicrophone } from "../infrastructure/audio/browser-microphone";
import { BrowserAudioTelemetryAdapter } from "../infrastructure/audio/audio-telemetry-adapter";
import { BrowserSpeechAdapter } from "../infrastructure/speech/browser-speech-adapter";
import { IndexedDbScriptRepository } from "../infrastructure/persistence/indexeddb-repository";

export function createReaderEngine(callbacks: ReaderEngineCallbacks): ReaderEngine {
  return new ReaderEngine(
    new BrowserSpeechAdapter(),
    new BrowserMicrophone(),
    new BrowserAudioTelemetryAdapter(),
    callbacks,
  );
}

export function createOptionalPersistence(): IndexedDbScriptRepository {
  return new IndexedDbScriptRepository();
}
