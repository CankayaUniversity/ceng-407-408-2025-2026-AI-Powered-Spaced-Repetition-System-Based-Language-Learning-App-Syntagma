// Records tab audio in segments aligned to subtitle cues.
// Usage: init(streamId) once, then startCue/stopCue on each cue transition.

export interface AudioRecorderOptions {
  onAudioReady: (cueIndex: number, dataUrl: string) => void;
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private activeCueIndex = -1;
  private readonly onAudioReady: (cueIndex: number, dataUrl: string) => void;
  private readonly audioMap = new Map<number, string>();
  private readonly mimeType: string;

  constructor(options: AudioRecorderOptions) {
    this.onAudioReady = options.onAudioReady;
    this.mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
  }

  async init(streamId: string): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // @ts-expect-error Chrome-specific tab-capture constraint
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });
    this.stream = stream;
  }

  startCue(cueIndex: number): void {
    if (!this.stream) return;
    this.flushCurrent();

    this.activeCueIndex = cueIndex;

    // Each cue gets its own chunks array captured in the closure.
    // This prevents the race where the next startCue clears this.chunks
    // before the previous recorder's onstop fires.
    const cueChunks: Blob[] = [];
    const capturedIndex = cueIndex;

    const rec = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) cueChunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(cueChunks, { type: this.mimeType });
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result !== 'string') return;
        this.audioMap.set(capturedIndex, reader.result);
        this.onAudioReady(capturedIndex, reader.result);
      };
      reader.readAsDataURL(blob);
    };
    rec.start();
    this.recorder = rec;
  }

  stopCue(): void {
    this.flushCurrent();
    this.activeCueIndex = -1;
  }

  private flushCurrent(): void {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
      this.recorder = null;
    }
  }

  getAudio(cueIndex: number): string | undefined {
    return this.audioMap.get(cueIndex);
  }

  destroy(): void {
    this.flushCurrent();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.audioMap.clear();
  }
}
