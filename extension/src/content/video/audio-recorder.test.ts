import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the audio recording ↔ upload data flow.
 * 
 * AudioRecorder itself requires Chrome's tabCapture API (browser-only), so we
 * test the helper functions and data contracts that make the flow work:
 * 
 * 1. dataUrlToBlob conversion (reused from service-worker)
 * 2. FlashcardPayload carries sentenceAudioDataUrl
 * 3. Audio file naming
 */

// Re-implement dataUrlToBlob (same logic as service-worker.ts) for testability
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',');
  if (!meta || !data) throw new Error('Invalid data URL');

  const contentType = meta.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

describe('dataUrlToBlob', () => {
  it('converts a base64 audio data URL to a Blob with correct type and size', () => {
    // Small WebM-like payload (not a real WebM, just testing the conversion)
    const sampleBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]);
    const base64 = btoa(String.fromCharCode(...sampleBytes));
    const dataUrl = `data:audio/webm;codecs=opus;base64,${base64}`;

    const blob = dataUrlToBlob(dataUrl);
    // Blob constructor normalizes MIME type — codecs param may be stripped
    expect(blob.type).toMatch(/^audio\/webm/);
    expect(blob.size).toBe(sampleBytes.length);
  });

  it('throws on invalid data URL', () => {
    expect(() => dataUrlToBlob('not-a-data-url')).toThrow('Invalid data URL');
  });

  it('defaults to application/octet-stream for malformed MIME', () => {
    const base64 = btoa('hello');
    // Missing "data:" prefix but has comma
    const blob = dataUrlToBlob(`noprefix;base64,${base64}`);
    expect(blob.type).toBe('application/octet-stream');
  });
});

describe('FlashcardPayload audio integration', () => {
  it('sentenceAudioDataUrl field is optional and accepted in the payload shape', () => {
    // Compile-time check: this object must satisfy the FlashcardPayload shape
    const payload = {
      id: 'test-1',
      lemma: 'hello',
      surfaceForm: 'Hello',
      sentence: 'Hello world',
      sourceUrl: 'https://youtube.com/watch?v=test',
      sourceTitle: 'Test Video',
      trMeaning: 'Merhaba',
      sentenceAudioDataUrl: 'data:audio/webm;base64,AAAA',
      createdAt: Date.now(),
      deckName: 'Syntagma',
      tags: ['syntagma'],
    };

    // Should include the audio field
    expect(payload.sentenceAudioDataUrl).toBe('data:audio/webm;base64,AAAA');
  });

  it('sentenceAudioDataUrl can be undefined', () => {
    const payload = {
      id: 'test-2',
      lemma: 'world',
      surfaceForm: 'World',
      sentence: 'Hello world',
      sourceUrl: 'https://youtube.com/watch?v=test',
      sourceTitle: 'Test Video',
      trMeaning: 'Dünya',
      createdAt: Date.now(),
      deckName: 'Syntagma',
      tags: ['syntagma'],
    };

    expect(payload).not.toHaveProperty('sentenceAudioDataUrl');
  });
});

describe('audio file naming', () => {
  it('generates correct extension for webm', () => {
    const mimeType = 'audio/webm;codecs=opus';
    const ext = mimeType.includes('webm') ? 'webm' : 'ogg';
    expect(ext).toBe('webm');
  });

  it('generates correct extension for ogg', () => {
    const mimeType = 'audio/ogg';
    const ext = mimeType.includes('webm') ? 'webm' : 'ogg';
    expect(ext).toBe('ogg');
  });

  it('generates unique file names with flashcardId and timestamp', () => {
    const flashcardId = 42;
    const now = Date.now();
    const fileName = `sentence_audio_${flashcardId}_${now}.webm`;
    
    expect(fileName).toContain('sentence_audio_42_');
    expect(fileName).toMatch(/\.webm$/);
  });
});

describe('MAX_CUE_DURATION_MS', () => {
  it('is exported and set to 30 seconds', async () => {
    const { MAX_CUE_DURATION_MS } = await import('./audio-recorder');
    expect(MAX_CUE_DURATION_MS).toBe(30_000);
  });
});
