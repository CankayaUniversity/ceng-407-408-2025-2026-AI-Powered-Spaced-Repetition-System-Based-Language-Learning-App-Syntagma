// Records audio from a video element aligned to subtitle cues.
// Uses video.captureStream() — no tabCapture permission needed.
// For on-demand capture: captureRange(video, startMs, endMs) seeks & records.

/** Maximum cue duration we'll record (30 s). Prevents runaway recordings. */
export const MAX_CUE_DURATION_MS = 30_000;

export interface AudioRecorderOptions {
  onAudioReady: (cueIndex: number, dataUrl: string) => void;
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private activeCueIndex = -1;
  private cueTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onAudioReady: (cueIndex: number, dataUrl: string) => void;
  private readonly audioMap = new Map<number, string>();
  private readonly blobMap = new Map<number, Blob>();
  private readonly mimeType: string;
  private capturing = false;
  private video: HTMLVideoElement | null = null;

  constructor(options: AudioRecorderOptions) {
    this.onAudioReady = options.onAudioReady;
    this.mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
  }

  /**
   * Initialize from a video element using captureStream().
   * No permissions required — works immediately.
   */
  initFromVideo(video: HTMLVideoElement): void {
    this.video = video;
    // captureStream() returns a live MediaStream from the video element.
    // We extract only the audio tracks from it.
    const fullStream = (video as any).captureStream() as MediaStream;
    const audioTracks = fullStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn('[Syntagma] Video has no audio tracks for capture');
      return;
    }
    // Create a stream with only audio tracks
    this.stream = new MediaStream(audioTracks);
    console.log('[Syntagma] AudioRecorder initialized from video element');
  }

  /** Whether an on-demand capture is currently in progress. */
  isCapturing(): boolean {
    return this.capturing;
  }

  /** Whether the recorder has been initialized with a stream. */
  isReady(): boolean {
    return this.stream !== null;
  }

  startCue(cueIndex: number): void {
    if (!this.stream || this.capturing) return;
    this.flushCurrent();

    this.activeCueIndex = cueIndex;

    const cueChunks: Blob[] = [];
    const capturedIndex = cueIndex;

    const rec = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) cueChunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(cueChunks, { type: this.mimeType });
      this.blobMap.set(capturedIndex, blob);
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

    this.cueTimer = setTimeout(() => this.flushCurrent(), MAX_CUE_DURATION_MS);
  }

  stopCue(): void {
    this.flushCurrent();
    this.activeCueIndex = -1;
  }

  /**
   * On-demand capture: seeks video to `startMs`, plays through to `endMs`,
   * records the audio, then restores the original playback position.
   * Returns the recorded audio as a data URL.
   */
  async captureRange(video: HTMLVideoElement, startMs: number, endMs: number): Promise<string> {
    // Re-initialize stream from video if not ready (lazy init)
    if (!this.stream) {
      this.initFromVideo(video);
    }
    if (!this.stream) throw new Error('Could not capture audio stream from video');
    if (this.capturing) throw new Error('Capture already in progress');

    const durationMs = endMs - startMs;
    if (durationMs <= 0 || durationMs > MAX_CUE_DURATION_MS) {
      throw new Error(`Invalid range: ${startMs}–${endMs}ms`);
    }

    this.flushCurrent();
    this.capturing = true;

    const savedTime = video.currentTime;
    const wasPaused = video.paused;

    try {
      console.log(`[Syntagma] Capturing audio: ${startMs}ms → ${endMs}ms (${durationMs}ms)`);

      // Seek to the start of the sentence
      video.currentTime = startMs / 1000;

      // Wait for seek to complete
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); clearTimeout(t); resolve(); };
        const t = setTimeout(() => { video.removeEventListener('seeked', onSeeked); reject(new Error('Seek timed out')); }, 5000);
        video.addEventListener('seeked', onSeeked);
        if (Math.abs(video.currentTime - startMs / 1000) < 0.05) {
          clearTimeout(t); video.removeEventListener('seeked', onSeeked); resolve();
        }
      });

      // Start recording
      const captureChunks: Blob[] = [];
      const rec = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) captureChunks.push(e.data);
      };

      const recordingDone = new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(captureChunks, { type: this.mimeType }));
      });

      rec.start();
      console.log('[Syntagma] Recording started, playing video...');

      // Play the video
      await video.play();

      // Wait until video reaches end of sentence
      await new Promise<void>((resolve) => {
        const endSec = endMs / 1000;
        const check = setInterval(() => {
          if (video.currentTime >= endSec || video.paused || video.ended) {
            clearInterval(check);
            resolve();
          }
        }, 50);
        setTimeout(() => { clearInterval(check); resolve(); }, durationMs + 2000);
      });

      // Stop recording
      video.pause();
      rec.stop();

      const blob = await recordingDone;
      console.log(`[Syntagma] Audio captured: ${blob.size} bytes`);

      // Convert to data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Failed to read audio blob'));
        };
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });

      return dataUrl;
    } finally {
      this.capturing = false;

      // Restore original position
      video.currentTime = savedTime;
      if (!wasPaused) {
        video.play().catch(() => {});
      }
    }
  }

  private flushCurrent(): void {
    if (this.cueTimer) { clearTimeout(this.cueTimer); this.cueTimer = null; }
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
      this.recorder = null;
    }
  }

  getAudio(cueIndex: number): string | undefined {
    return this.audioMap.get(cueIndex);
  }

  getAudioBlob(cueIndex: number): Blob | undefined {
    return this.blobMap.get(cueIndex);
  }

  getMimeType(): string {
    return this.mimeType;
  }

  destroy(): void {
    this.flushCurrent();
    this.stream = null;
    this.video = null;
    this.audioMap.clear();
    this.blobMap.clear();
  }
}


