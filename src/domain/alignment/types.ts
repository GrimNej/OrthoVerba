import type { ParsedScript } from "../script/types";
import type { ObservedToken, RecognitionSnapshotData } from "../transcript/types";

export type CursorStage = "observed" | "provisional" | "stable" | "committed";

export interface CursorResult {
  readonly observedBoundary: number;
  readonly provisionalBoundary: number;
  readonly stableBoundary: number | null;
  readonly committedBoundary: number;
  readonly stage: CursorStage;
  readonly confidence: number;
  readonly recognitionEpoch: number;
  readonly recognitionRevision: number;
  readonly diagnostics: {
    readonly matchedTokens: number;
    readonly margin: number;
    readonly alternativeRank: number;
    readonly restartGuardActive: boolean;
  };
}

export interface AlignmentHypothesis {
  readonly boundary: number;
  readonly score: number;
  readonly matched: number;
  readonly matchedInformation: number;
  readonly insertions: number;
  readonly alternativeRank: number;
}

export interface TrackerState {
  readonly parsed: ParsedScript;
  readonly locale: string;
  readonly committedBoundary: number;
  readonly stableBoundary: number | null;
  readonly provisionalBoundary: number;
  readonly lastObservedBoundary: number;
  readonly lastEpoch: number;
  readonly lastRevision: number;
  readonly stableRevisions: number;
  readonly finalTail: readonly string[];
  readonly finalSlotCountByEpoch: ReadonlyMap<number, number>;
  readonly restartGuard: {
    readonly active: boolean;
    readonly epoch: number;
    readonly genuinelyNewFinalMatches: number;
  };
}

export interface TrackerProcessInput {
  readonly state: TrackerState;
  readonly snapshot: RecognitionSnapshotData;
}

export interface TrackerProcessOutput {
  readonly state: TrackerState;
  readonly result: CursorResult;
}

export interface ObservationPath {
  readonly tokens: readonly ObservedToken[];
  readonly prior: number;
  readonly rank: number;
}
