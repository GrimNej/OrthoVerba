export interface MicrophonePort {
  open(): Promise<MediaStream>;
  close(): void;
}
