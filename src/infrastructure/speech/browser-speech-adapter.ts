import type { RecognitionCallbacks, RecognitionPort } from "../../application/ports/recognition-port";
import type {
  RecognitionAlternativeData,
  RecognitionResultSlotData,
  RecognitionSnapshotData,
} from "../../domain/transcript/types";
import type {
  SpeechRecognitionConstructorLike,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
} from "./web-speech-types";

function constructorForBrowser(): SpeechRecognitionConstructorLike | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function clampConfidence(value: number): number | null {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

export class BrowserSpeechAdapter implements RecognitionPort {
  readonly supported = constructorForBrowser() !== null;
  readonly mode = this.supported ? "browser-selected" as const : "unsupported" as const;
  #recognition: SpeechRecognitionLike | null = null;
  #callbacks: RecognitionCallbacks | null = null;
  #desiredRunning = false;
  #restartTimer: number | null = null;
  #epoch = 0;
  #revision = 0;
  #restartAttempt = 0;

  start(locale: string, callbacks: RecognitionCallbacks): void {
    this.stop();
    const Constructor = constructorForBrowser();
    this.#callbacks = callbacks;
    this.#desiredRunning = true;
    if (Constructor === null) {
      callbacks.onError("This browser does not provide Web Speech recognition. Use current Chrome or Edge.", true);
      return;
    }
    this.#createAndStart(Constructor, locale);
  }

  #createAndStart(Constructor: SpeechRecognitionConstructorLike, locale: string): void {
    if (!this.#desiredRunning) return;
    const recognition = new Constructor();
    this.#recognition = recognition;
    this.#epoch += 1;
    this.#revision = 0;
    const epoch = this.#epoch;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = locale;

    recognition.onstart = () => {
      if (recognition !== this.#recognition) return;
      this.#restartAttempt = 0;
      this.#callbacks?.onStarted();
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (recognition !== this.#recognition || !this.#desiredRunning) return;
      this.#revision += 1;
      const slots: RecognitionResultSlotData[] = [];
      const maximumSlots = Math.min(256, event.results.length);
      for (let slotIndex = 0; slotIndex < maximumSlots; slotIndex += 1) {
        const result = event.results[slotIndex];
        if (result === undefined) continue;
        const alternatives: RecognitionAlternativeData[] = [];
        const maximumAlternatives = Math.min(5, result.length);
        for (let rank = 0; rank < maximumAlternatives; rank += 1) {
          const alternative = result[rank];
          if (alternative === undefined) continue;
          alternatives.push({
            transcript: alternative.transcript.slice(0, 4_096),
            confidence: clampConfidence(alternative.confidence),
            rank,
          });
        }
        slots.push({ slotIndex, isFinal: result.isFinal, alternatives });
      }
      const snapshot: RecognitionSnapshotData = {
        epoch,
        revision: this.#revision,
        resultIndex: Math.max(0, event.resultIndex),
        slots,
        receivedAtMainMs: performance.now(),
      };
      this.#callbacks?.onSnapshot(snapshot);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (recognition !== this.#recognition) return;
      const fatal = ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(event.error);
      this.#callbacks?.onError(event.message ?? `Speech recognition error: ${event.error}`, fatal);
      if (fatal) this.#desiredRunning = false;
    };

    recognition.onend = () => {
      if (recognition !== this.#recognition) return;
      this.#recognition = null;
      if (!this.#desiredRunning) {
        this.#callbacks?.onStopped();
        return;
      }
      const delay = Math.min(8_000, 120 * 2 ** Math.min(5, this.#restartAttempt));
      this.#restartAttempt += 1;
      this.#restartTimer = window.setTimeout(() => this.#createAndStart(Constructor, locale), delay);
    };

    try {
      recognition.start();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to start speech recognition.";
      this.#callbacks?.onError(message, false);
      this.#restartTimer = window.setTimeout(() => this.#createAndStart(Constructor, locale), 300);
    }
  }

  stop(): void {
    this.#desiredRunning = false;
    if (this.#restartTimer !== null) {
      window.clearTimeout(this.#restartTimer);
      this.#restartTimer = null;
    }
    const recognition = this.#recognition;
    this.#recognition = null;
    if (recognition !== null) {
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onstart = null;
      try { recognition.stop(); } catch { recognition.abort(); }
    }
    this.#callbacks?.onStopped();
  }

  dispose(): void {
    this.stop();
    this.#callbacks = null;
  }
}
