import TrackingWorker from "../../workers/tracking-worker.ts?worker";
import type { CursorResult } from "../../domain/alignment/types";
import type { ParsedScript } from "../../domain/script/types";
import type { RecognitionSnapshotData } from "../../domain/transcript/types";
import {
  TRACKING_PROTOCOL_VERSION,
  type TrackingWorkerRequest,
  type TrackingWorkerResponse,
  type WorkerFence,
} from "./worker-protocol";

export interface TrackerClientCallbacks {
  readonly onReady: (parsed: ParsedScript) => void;
  readonly onResult: (result: CursorResult) => void;
  readonly onError: (message: string) => void;
}

export class TrackingWorkerClient {
  readonly #worker: Worker;
  readonly #callbacks: TrackerClientCallbacks;
  #sessionGeneration = 0;
  #scriptVersion = 0;
  #controlGeneration = 0;
  #requestId = 0;
  #activeEpoch = 0;
  #activeRevision = 0;
  #activeRequestId = 0;

  constructor(callbacks: TrackerClientCallbacks) {
    this.#callbacks = callbacks;
    this.#worker = new TrackingWorker();
    this.#worker.addEventListener("message", this.#onMessage);
    this.#worker.addEventListener("error", () => callbacks.onError("The tracking worker crashed."));
  }

  #fence(epoch = this.#activeEpoch, revision = this.#activeRevision): WorkerFence {
    this.#requestId += 1;
    return {
      protocolVersion: TRACKING_PROTOCOL_VERSION,
      sessionGeneration: this.#sessionGeneration,
      scriptVersion: this.#scriptVersion,
      controlGeneration: this.#controlGeneration,
      requestId: this.#requestId,
      recognitionEpoch: epoch,
      recognitionRevision: revision,
    };
  }

  initialize(sourceText: string, locale: string): void {
    this.#scriptVersion += 1;
    const fence = this.#fence(0, 0);
    this.#activeRequestId = fence.requestId;
    const request: TrackingWorkerRequest = {
      type: "INITIALIZE_SCRIPT",
      fence,
      sourceText,
      locale,
    };
    this.#worker.postMessage(request);
  }

  beginSession(): void {
    this.#sessionGeneration += 1;
  }

  track(snapshot: RecognitionSnapshotData): void {
    this.#activeEpoch = snapshot.epoch;
    this.#activeRevision = snapshot.revision;
    const fence = this.#fence(snapshot.epoch, snapshot.revision);
    this.#activeRequestId = fence.requestId;
    const request: TrackingWorkerRequest = {
      type: "TRACK",
      fence,
      snapshot,
    };
    this.#worker.postMessage(request);
  }

  reanchor(boundary: number): void {
    this.#controlGeneration += 1;
    const fence = this.#fence();
    this.#activeRequestId = fence.requestId;
    const request: TrackingWorkerRequest = {
      type: "MANUAL_REANCHOR",
      fence,
      boundary,
    };
    this.#worker.postMessage(request);
  }

  dispose(): void {
    const request: TrackingWorkerRequest = { type: "DISPOSE", fence: this.#fence() };
    this.#worker.postMessage(request);
    this.#worker.removeEventListener("message", this.#onMessage);
    this.#worker.terminate();
  }

  readonly #onMessage = (event: MessageEvent<TrackingWorkerResponse>): void => {
    const response = event.data;
    if (response.fence.sessionGeneration !== this.#sessionGeneration ||
        response.fence.scriptVersion !== this.#scriptVersion ||
        response.fence.controlGeneration !== this.#controlGeneration ||
        response.fence.requestId !== this.#activeRequestId ||
        response.fence.recognitionEpoch !== this.#activeEpoch ||
        response.fence.recognitionRevision !== this.#activeRevision) return;
    if (response.type === "READY") this.#callbacks.onReady(response.parsed);
    else if (response.type === "TRACKING_RESULT") this.#callbacks.onResult(response.result);
    else if (response.type === "ERROR") this.#callbacks.onError(response.message);
  };
}
