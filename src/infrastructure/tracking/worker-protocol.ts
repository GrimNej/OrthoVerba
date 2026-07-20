import type { CursorResult } from "../../domain/alignment/types";
import type { ParsedScript } from "../../domain/script/types";
import type { RecognitionSnapshotData } from "../../domain/transcript/types";

export const TRACKING_PROTOCOL_VERSION = 1 as const;

export interface WorkerFence {
  readonly protocolVersion: typeof TRACKING_PROTOCOL_VERSION;
  readonly sessionGeneration: number;
  readonly scriptVersion: number;
  readonly controlGeneration: number;
  readonly requestId: number;
  readonly recognitionEpoch: number;
  readonly recognitionRevision: number;
}

export type TrackingWorkerRequest =
  | {
      readonly type: "INITIALIZE_SCRIPT";
      readonly fence: WorkerFence;
      readonly sourceText: string;
      readonly locale: string;
    }
  | {
      readonly type: "TRACK";
      readonly fence: WorkerFence;
      readonly snapshot: RecognitionSnapshotData;
    }
  | {
      readonly type: "MANUAL_REANCHOR";
      readonly fence: WorkerFence;
      readonly boundary: number;
    }
  | {
      readonly type: "DISPOSE";
      readonly fence: WorkerFence;
    };

export type TrackingWorkerResponse =
  | {
      readonly type: "READY";
      readonly fence: WorkerFence;
      readonly parsed: ParsedScript;
    }
  | {
      readonly type: "TRACKING_RESULT";
      readonly fence: WorkerFence;
      readonly result: CursorResult;
    }
  | {
      readonly type: "REANCHORED";
      readonly fence: WorkerFence;
      readonly boundary: number;
    }
  | {
      readonly type: "ERROR";
      readonly fence: WorkerFence;
      readonly code: string;
      readonly message: string;
      readonly recoverable: boolean;
    };

export function isWorkerFence(value: unknown): value is WorkerFence {
  if (typeof value !== "object" || value === null) return false;
  const object = value as Record<string, unknown>;
  const integerFields = [
    "sessionGeneration",
    "scriptVersion",
    "controlGeneration",
    "requestId",
    "recognitionEpoch",
    "recognitionRevision",
  ];
  return object["protocolVersion"] === TRACKING_PROTOCOL_VERSION && integerFields.every((field) => {
    const candidate = object[field];
    return typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0;
  });
}
