import type { ParsedScript } from "../script/types";
import { tokenizeObservation } from "../transcript/tokenize-observation";
import type { RecognitionResultSlotData } from "../transcript/types";
import { lexicalSimilarity } from "./lexical";
import type {
  AlignmentHypothesis,
  CursorResult,
  ObservationPath,
  TrackerProcessInput,
  TrackerProcessOutput,
  TrackerState,
} from "./types";

const BEAM_WIDTH = 20;
const LOOKAHEAD = 56;
const BACKTRACK = 8;
const FINAL_TAIL_LIMIT = 16;
const ALTERNATIVES_PER_SLOT = 5;
const INTERIM_PATH_WIDTH = 8;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createTrackerState(parsed: ParsedScript): TrackerState {
  return {
    parsed,
    locale: parsed.locale,
    committedBoundary: 0,
    stableBoundary: null,
    provisionalBoundary: 0,
    lastObservedBoundary: 0,
    lastEpoch: -1,
    lastRevision: -1,
    stableRevisions: 0,
    finalTail: [],
    finalSlotCountByEpoch: new Map(),
    restartGuard: { active: false, epoch: -1, genuinelyNewFinalMatches: 0 },
  };
}

function buildObservationPaths(
  slots: readonly RecognitionResultSlotData[],
  locale: string,
  width: number,
): readonly ObservationPath[] {
  let paths: ObservationPath[] = [{ tokens: [], prior: 0, rank: 0 }];
  for (const slot of slots) {
    const alternatives = slot.alternatives.slice(0, ALTERNATIVES_PER_SLOT);
    if (alternatives.length === 0) continue;
    const expanded: ObservationPath[] = [];
    for (const path of paths) {
      for (const alternative of alternatives) {
        const tokens = tokenizeObservation(alternative, locale);
        const confidencePrior = alternative.confidence === null ? 0 : (alternative.confidence - 0.5) * 0.6;
        expanded.push({
          tokens: [...path.tokens, ...tokens],
          prior: path.prior + alternative.rank * Math.log(0.82) + confidencePrior,
          rank: Math.max(path.rank, alternative.rank),
        });
      }
    }
    paths = expanded.sort((left, right) => right.prior - left.prior).slice(0, width);
  }
  return paths.length > 0 ? paths : [{ tokens: [], prior: 0, rank: 0 }];
}

function longestCredibleOverlap(previousTail: readonly string[], current: readonly string[]): number {
  const maximum = Math.min(previousTail.length, current.length, FINAL_TAIL_LIMIT);
  for (let length = maximum; length >= 2; length -= 1) {
    let same = true;
    for (let index = 0; index < length; index += 1) {
      if (previousTail[previousTail.length - length + index] !== current[index]) {
        same = false;
        break;
      }
    }
    if (same) return length;
  }
  return 0;
}

function alignPath(
  parsed: ParsedScript,
  startBoundary: number,
  path: ObservationPath,
): AlignmentHypothesis {
  const tokenCount = parsed.tokens.length;
  let hypotheses: AlignmentHypothesis[] = [{
    boundary: startBoundary,
    score: path.prior,
    matched: 0,
    matchedInformation: 0,
    insertions: 0,
    alternativeRank: path.rank,
  }];

  for (const observed of path.tokens) {
    const expanded: AlignmentHypothesis[] = [];
    for (const hypothesis of hypotheses) {
      expanded.push({
        ...hypothesis,
        score: hypothesis.score - 1.05,
        insertions: hypothesis.insertions + 1,
      });

      const first = Math.max(0, hypothesis.boundary - BACKTRACK);
      const last = Math.min(tokenCount - 1, hypothesis.boundary + LOOKAHEAD);
      for (let target = first; target <= last; target += 1) {
        const scriptToken = parsed.tokens[target];
        if (scriptToken === undefined) continue;
        const similarity = lexicalSimilarity(observed.normalized, scriptToken.normalized);
        if (similarity < 0.56) continue;
        const skipDistance = Math.max(0, target - hypothesis.boundary);
        const skipPenalty = skipDistance === 0 ? 0 : -0.78 - Math.max(0, skipDistance - 1) * 0.5;
        const backwardsPenalty = target < hypothesis.boundary ? -1.4 : 0;
        const confidence = observed.confidence === null ? 0 : (observed.confidence - 0.5) * 0.35;
        const emission = similarity * scriptToken.informationWeight * 2.8 + confidence;
        expanded.push({
          boundary: target + 1,
          score: hypothesis.score + emission + skipPenalty + backwardsPenalty,
          matched: hypothesis.matched + 1,
          matchedInformation: hypothesis.matchedInformation + scriptToken.informationWeight,
          insertions: hypothesis.insertions,
          alternativeRank: path.rank,
        });
      }
    }

    const bestByBoundary = new Map<number, AlignmentHypothesis>();
    for (const candidate of expanded) {
      const existing = bestByBoundary.get(candidate.boundary);
      if (existing === undefined || candidate.score > existing.score) {
        bestByBoundary.set(candidate.boundary, candidate);
      }
    }
    hypotheses = [...bestByBoundary.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, BEAM_WIDTH);
  }

  return hypotheses[0] ?? {
    boundary: startBoundary,
    score: Number.NEGATIVE_INFINITY,
    matched: 0,
    matchedInformation: 0,
    insertions: path.tokens.length,
    alternativeRank: path.rank,
  };
}

function chooseBest(
  parsed: ParsedScript,
  startBoundary: number,
  paths: readonly ObservationPath[],
): { best: AlignmentHypothesis; margin: number; path: ObservationPath } {
  const candidates = paths.map((path) => ({ path, hypothesis: alignPath(parsed, startBoundary, path) }));
  candidates.sort((left, right) => right.hypothesis.score - left.hypothesis.score);
  const fallbackPath: ObservationPath = { tokens: [], prior: 0, rank: 0 };
  const selected = candidates[0] ?? { path: fallbackPath, hypothesis: alignPath(parsed, startBoundary, fallbackPath) };
  const runner = candidates.find((candidate) => candidate.hypothesis.boundary !== selected.hypothesis.boundary);
  return {
    best: selected.hypothesis,
    path: selected.path,
    margin: runner === undefined ? 0 : selected.hypothesis.score - runner.hypothesis.score,
  };
}

function appendTail(previous: readonly string[], next: readonly string[]): readonly string[] {
  return [...previous, ...next].slice(-FINAL_TAIL_LIMIT);
}

function cursorResult(
  state: TrackerState,
  boundary: number,
  stage: CursorResult["stage"],
  margin: number,
  best: AlignmentHypothesis,
  snapshotEpoch: number,
  snapshotRevision: number,
): CursorResult {
  const confidence = clamp(0.35 + Math.max(0, margin) / 8 + best.matchedInformation / 12, 0, 1);
  return {
    observedBoundary: boundary,
    provisionalBoundary: state.provisionalBoundary,
    stableBoundary: state.stableBoundary,
    committedBoundary: state.committedBoundary,
    stage,
    confidence,
    recognitionEpoch: snapshotEpoch,
    recognitionRevision: snapshotRevision,
    diagnostics: {
      matchedTokens: best.matched,
      margin,
      alternativeRank: best.alternativeRank,
      restartGuardActive: state.restartGuard.active,
    },
  };
}

export function processSnapshot(input: TrackerProcessInput): TrackerProcessOutput {
  const { snapshot } = input;
  let state = input.state;
  if (snapshot.epoch === state.lastEpoch && snapshot.revision <= state.lastRevision) {
    const empty: AlignmentHypothesis = {
      boundary: state.lastObservedBoundary,
      score: 0,
      matched: 0,
      matchedInformation: 0,
      insertions: 0,
      alternativeRank: 0,
    };
    return { state, result: cursorResult(state, state.lastObservedBoundary, "observed", 0, empty, snapshot.epoch, snapshot.revision) };
  }

  const epochChanged = snapshot.epoch !== state.lastEpoch;
  const previousFinalCount = epochChanged ? 0 : (state.finalSlotCountByEpoch.get(snapshot.epoch) ?? 0);
  const finalSlots = snapshot.slots.filter((slot) => slot.isFinal);
  const interimSlots = snapshot.slots.filter((slot) => !slot.isFinal);
  const newFinalSlots = finalSlots.slice(previousFinalCount);
  let finalPaths = buildObservationPaths(newFinalSlots, state.locale, INTERIM_PATH_WIDTH);
  const interimPaths = buildObservationPaths(interimSlots, state.locale, INTERIM_PATH_WIDTH);

  let restartGuard = epochChanged && state.lastEpoch >= 0
    ? { active: true, epoch: snapshot.epoch, genuinelyNewFinalMatches: 0 }
    : state.restartGuard;

  if (epochChanged && state.finalTail.length > 0) {
    finalPaths = finalPaths.map((path) => {
      const normalized = path.tokens.map((token) => token.normalized);
      const overlap = longestCredibleOverlap(state.finalTail, normalized);
      return { ...path, tokens: path.tokens.slice(overlap) };
    });
  }

  const finalChoice = chooseBest(state.parsed, state.committedBoundary, finalPaths);
  const interimChoice = chooseBest(state.parsed, finalChoice.best.boundary, interimPaths);
  const hasFinalEvidence = finalPaths.some((path) => path.tokens.length > 0);
  const best = interimPaths.some((path) => path.tokens.length > 0) ? interimChoice.best : finalChoice.best;
  const margin = interimPaths.some((path) => path.tokens.length > 0) ? interimChoice.margin : finalChoice.margin;
  const observedBoundary = best.boundary;

  const finalMatched = hasFinalEvidence ? finalChoice.best.matched : 0;
  if (restartGuard.active && finalMatched > 0) {
    const genuinelyNew = Math.min(2, restartGuard.genuinelyNewFinalMatches + finalMatched);
    restartGuard = {
      ...restartGuard,
      genuinelyNewFinalMatches: genuinelyNew,
      active: genuinelyNew < 2,
    };
  }

  const insertionRatio = best.matched + best.insertions === 0 ? 1 : best.insertions / (best.matched + best.insertions);
  const evidenceEnough = best.matched >= 2 && best.matchedInformation >= 1.5 && insertionRatio <= 0.65;
  const oneDistinctive = !restartGuard.active && best.matched === 1 && best.matchedInformation >= 2.5;
  const canMove = !restartGuard.active && (evidenceEnough || oneDistinctive);
  const provisionalBoundary = canMove ? observedBoundary : state.provisionalBoundary;
  const sameAsPrevious = Math.abs(provisionalBoundary - state.provisionalBoundary) <= 1;
  const stableRevisions = canMove ? (sameAsPrevious ? state.stableRevisions + 1 : 1) : state.stableRevisions;
  const stable = canMove && stableRevisions >= 2 && margin >= 0.8;
  const committed = stable && hasFinalEvidence && stableRevisions >= 2 && (margin >= 1.2 || finalChoice.best.matchedInformation >= 2.5);
  const stableBoundary = stable ? provisionalBoundary : state.stableBoundary;
  const committedBoundary = committed ? Math.max(state.committedBoundary, provisionalBoundary) : state.committedBoundary;

  const chosenFinalTokens = finalChoice.path.tokens.map((token) => token.normalized);
  const finalSlotCountByEpoch = new Map(state.finalSlotCountByEpoch);
  finalSlotCountByEpoch.set(snapshot.epoch, finalSlots.length);

  state = {
    ...state,
    committedBoundary,
    stableBoundary,
    provisionalBoundary,
    lastObservedBoundary: observedBoundary,
    lastEpoch: snapshot.epoch,
    lastRevision: snapshot.revision,
    stableRevisions,
    finalTail: appendTail(state.finalTail, chosenFinalTokens),
    finalSlotCountByEpoch,
    restartGuard,
  };

  const stage: CursorResult["stage"] = committed ? "committed" : stable ? "stable" : canMove ? "provisional" : "observed";
  return {
    state,
    result: {
      ...cursorResult(state, observedBoundary, stage, margin, best, snapshot.epoch, snapshot.revision),
      provisionalBoundary,
      stableBoundary,
      committedBoundary,
    },
  };
}
