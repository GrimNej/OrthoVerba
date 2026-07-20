/// <reference lib="webworker" />

import { createTrackerState, processSnapshot } from "../domain/alignment/tracker";
import type { TrackerState } from "../domain/alignment/types";
import { parseScript } from "../domain/script/parse-script";
import {
  TRACKING_PROTOCOL_VERSION,
  isWorkerFence,
  type TrackingWorkerRequest,
  type TrackingWorkerResponse,
  type WorkerFence,
} from "../infrastructure/tracking/worker-protocol";

const scope = self as DedicatedWorkerGlobalScope;
let trackerState: TrackerState | null = null;
let activeScriptVersion = -1;
let activeSessionGeneration = -1;
let activeControlGeneration = -1;

function errorResponse(fence: WorkerFence, code: string, message: string, recoverable: boolean): TrackingWorkerResponse {
  return { type: "ERROR", fence, code, message, recoverable };
}

function isCurrent(fence: WorkerFence): boolean {
  return fence.protocolVersion === TRACKING_PROTOCOL_VERSION &&
    fence.sessionGeneration >= activeSessionGeneration &&
    fence.scriptVersion >= activeScriptVersion &&
    fence.controlGeneration >= activeControlGeneration;
}

scope.onmessage = (event: MessageEvent<unknown>): void => {
  const request = event.data as Partial<TrackingWorkerRequest>;
  if (typeof request !== "object" || request === null || !isWorkerFence(request.fence)) return;
  const fence = request.fence;

  try {
    if (request.type === "INITIALIZE_SCRIPT") {
      if (typeof request.sourceText !== "string" || typeof request.locale !== "string") {
        scope.postMessage(errorResponse(fence, "INVALID_INITIALIZE", "Invalid script initialization payload.", false));
        return;
      }
      const parsed = parseScript(request.sourceText, request.locale);
      trackerState = createTrackerState(parsed);
      activeScriptVersion = fence.scriptVersion;
      activeSessionGeneration = fence.sessionGeneration;
      activeControlGeneration = fence.controlGeneration;
      const response: TrackingWorkerResponse = { type: "READY", fence, parsed };
      scope.postMessage(response);
      return;
    }

    if (!isCurrent(fence)) return;

    if (request.type === "TRACK") {
      if (trackerState === null || request.snapshot === undefined) {
        scope.postMessage(errorResponse(fence, "NOT_READY", "The tracker is not initialized.", true));
        return;
      }
      const output = processSnapshot({ state: trackerState, snapshot: request.snapshot });
      trackerState = output.state;
      const response: TrackingWorkerResponse = { type: "TRACKING_RESULT", fence, result: output.result };
      scope.postMessage(response);
      return;
    }

    if (request.type === "MANUAL_REANCHOR") {
      if (trackerState === null || typeof request.boundary !== "number") return;
      const boundary = Math.max(0, Math.min(trackerState.parsed.tokens.length, Math.floor(request.boundary)));
      trackerState = {
        ...trackerState,
        committedBoundary: boundary,
        stableBoundary: boundary,
        provisionalBoundary: boundary,
        lastObservedBoundary: boundary,
        stableRevisions: 0,
        finalTail: [],
        restartGuard: { active: false, epoch: fence.recognitionEpoch, genuinelyNewFinalMatches: 0 },
      };
      activeControlGeneration = fence.controlGeneration;
      const response: TrackingWorkerResponse = { type: "REANCHORED", fence, boundary };
      scope.postMessage(response);
      return;
    }

    if (request.type === "DISPOSE") {
      trackerState = null;
      scope.close();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown tracking worker error.";
    scope.postMessage(errorResponse(fence, "WORKER_FAILURE", message, true));
  }
};
