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
    const tryAttach = (): boolean => {
      const fullStream = (video as any).captureStream?.() as MediaStream | undefined;
      if (!fullStream) return false;
      const audioTracks = fullStream.getAudioTracks();
      if (audioTracks.length === 0) return false;
      this.stream = new MediaStream(audioTracks);
      console.log('[Syntagma] AudioRecorder initialized from video element');
      return true;
    };
    if (tryAttach()) return;

    // captureStream() may not expose audio tracks until playback has actually
    // begun (YouTube uses MediaSource Extensions; tracks attach asynchronously).
    // Retry on play and addtrack events for up to 30 s.
    console.warn('[Syntagma] No audio tracks yet — will retry when video plays');
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (this.stream || tryAttach() || attempts > 30) clearInterval(interval);
    }, 1000);
    const onPlay = () => { tryAttach(); };
    video.addEventListener('playing', onPlay, { once: false });
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
      // Seek 1 s before the target to warm up YouTube's MSE audio decoder.
      // captureStream() doesn't deliver samples immediately after a seek +
      // play — the decoder needs ~0.5-1 s to start producing frames. The
      // pre-roll is played (and recorded) but the extra silence/audio at the
      // head is harmless; without it the first 1-2 words are lost.
      const PREROLL_MS = 1000;
      const seekMs = Math.max(0, startMs - PREROLL_MS);
      console.log(`[Syntagma] Capturing audio: ${startMs}ms → ${endMs}ms (pre-roll from ${seekMs}ms)`);

      video.currentTime = seekMs / 1000;

      // Wait for seek to complete
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); clearTimeout(t); resolve(); };
        const t = setTimeout(() => { video.removeEventListener('seeked', onSeeked); reject(new Error('Seek timed out')); }, 5000);
        video.addEventListener('seeked', onSeeked);
        if (Math.abs(video.currentTime - seekMs / 1000) < 0.05) {
          clearTimeout(t); video.removeEventListener('seeked', onSeeked); resolve();
        }
      });

      const captureChunks: Blob[] = [];
      const rec = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) captureChunks.push(e.data);
      };

      const recordingDone = new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(captureChunks, { type: this.mimeType }));
      });

      // Play from pre-roll position to warm up the audio decoder
      await video.play();

      // Wait until currentTime reaches the actual sentence start before
      // starting the recorder — the pre-roll lets the decoder produce
      // samples but we don't want that audio in the clip.
      const startSec = startMs / 1000;
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (video.currentTime >= startSec || video.ended) {
            clearInterval(check);
            resolve();
          }
        }, 30);
        setTimeout(() => { clearInterval(check); resolve(); }, PREROLL_MS + 2000);
      });

      rec.start();
      console.log('[Syntagma] Recording started at sentence start');

      // Wait until video reaches end of sentence.
      await new Promise<void>((resolve) => {
        const endSec = endMs / 1000;
        const check = setInterval(() => {
          if (video.currentTime >= endSec || video.ended) {
            clearInterval(check);
            resolve();
          }
        }, 50);
        const safetyMs = Math.max(durationMs * 4, 15_000);
        setTimeout(() => { clearInterval(check); resolve(); }, safetyMs);
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


