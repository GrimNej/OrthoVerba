import type { MicrophonePort } from "../../application/ports/microphone-port";

export class BrowserMicrophone implements MicrophonePort {
  #stream: MediaStream | null = null;

  async open(): Promise<MediaStream> {
    this.close();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    this.#stream = stream;
    return stream;
  }

  close(): void {
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;
  }
}
