export interface RecognitionAlternativeData {
  readonly transcript: string;
  readonly confidence: number | null;
  readonly rank: number;
}

export interface RecognitionResultSlotData {
  readonly slotIndex: number;
  readonly isFinal: boolean;
  readonly alternatives: readonly RecognitionAlternativeData[];
}

export interface RecognitionSnapshotData {
  readonly epoch: number;
  readonly revision: number;
  readonly resultIndex: number;
  readonly slots: readonly RecognitionResultSlotData[];
  readonly receivedAtMainMs: number;
}

export interface ObservedToken {
  readonly raw: string;
  readonly normalized: string;
  readonly confidence: number | null;
  readonly alternativeRank: number;
}
