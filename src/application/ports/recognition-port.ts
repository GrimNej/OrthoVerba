import type { RecognitionSnapshotData } from "../../domain/transcript/types";

export type RecognitionMode = "browser-selected" | "unsupported";

export interface RecognitionCallbacks {
  readonly onSnapshot: (snapshot: RecognitionSnapshotData) => void;
  readonly onStarted: () => void;
  readonly onStopped: () => void;
  readonly onError: (message: string, fatal: boolean) => void;
}

export interface RecognitionPort {
  readonly mode: RecognitionMode;
  readonly supported: boolean;
  start(locale: string, callbacks: RecognitionCallbacks): void;
  stop(): void;
  dispose(): void;
}
