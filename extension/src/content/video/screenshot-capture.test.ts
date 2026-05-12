import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureVideoFrame,
  captureVideoScreenshotWithFallback,
  withSuppressedOverlayAndCursor,
} from './screenshot-capture';

function makeRect(width: number, height: number, left = 0, top = 0): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function setVideoDimensions(
  video: HTMLVideoElement,
  dims: { videoWidth: number; videoHeight: number; rect: DOMRect },
): void {
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: dims.videoWidth });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: dims.videoHeight });
  vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(dims.rect);
}

function mockCanvas(options: {
  context: { drawImage: ReturnType<typeof vi.fn> } | null;
  toDataURLResult?: string;
  toDataURLThrows?: boolean;
}) {
  const canvasMock = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => options.context),
    toDataURL: vi.fn(() => {
      if (options.toDataURLThrows) throw new Error('toDataURL failed');
      return options.toDataURLResult ?? 'data:image/jpeg;base64,frame';
    }),
  } as unknown as HTMLCanvasElement;

  const originalCreate = document.createElement.bind(document);
  const createSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    if (tagName.toLowerCase() === 'canvas') return canvasMock;
    return originalCreate(tagName);
  }) as typeof document.createElement);

  return { canvasMock, createSpy };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('video/screenshot-capture: captureVideoFrame', () => {
  it('returns a JPEG data URL when drawing from intrinsic video dimensions succeeds', () => {
    const video = document.createElement('video');
    setVideoDimensions(video, {
      videoWidth: 1920,
      videoHeight: 1080,
      rect: makeRect(400, 225),
    });

    const drawImage = vi.fn();
    const { canvasMock } = mockCanvas({
      context: { drawImage },
      toDataURLResult: 'data:image/jpeg;base64,ok',
    });

    const dataUrl = captureVideoFrame(video);

    expect(dataUrl).toBe('data:image/jpeg;base64,ok');
    expect(canvasMock.width).toBe(1920);
    expect(canvasMock.height).toBe(1080);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1920, 1080);
  });

  it('falls back to rendered size * devicePixelRatio when intrinsic video size is unavailable', () => {
    const video = document.createElement('video');
    setVideoDimensions(video, {
      videoWidth: 0,
      videoHeight: 0,
      rect: makeRect(320, 180),
    });

    vi.stubGlobal('devicePixelRatio', 2);

    const drawImage = vi.fn();
    const { canvasMock } = mockCanvas({
      context: { drawImage },
    });

    const dataUrl = captureVideoFrame(video);

    expect(dataUrl).toBe('data:image/jpeg;base64,frame');
    expect(canvasMock.width).toBe(640);
    expect(canvasMock.height).toBe(360);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
  });

  it('fails gracefully when context, draw, or export is unavailable', () => {
    const video = document.createElement('video');
    setVideoDimensions(video, {
      videoWidth: 640,
      videoHeight: 360,
      rect: makeRect(640, 360),
    });

    mockCanvas({ context: null });
    expect(captureVideoFrame(video)).toBeNull();

    const drawThrows = vi.fn(() => {
      throw new Error('draw failed');
    });
    mockCanvas({ context: { drawImage: drawThrows } });
    expect(captureVideoFrame(video)).toBeNull();

    const drawImage = vi.fn();
    mockCanvas({ context: { drawImage }, toDataURLThrows: true });
    expect(captureVideoFrame(video)).toBeNull();
  });
});

describe('video/screenshot-capture: withSuppressedOverlayAndCursor', () => {
  it('suppresses overlay/cursor before capture and restores them after success', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    const overlay = document.createElement('div');
    overlay.style.visibility = 'visible';
    document.body.appendChild(overlay);

    const result = await withSuppressedOverlayAndCursor(overlay, async () => {
      expect(overlay.style.visibility).toBe('hidden');
      const cursorStyle = document.querySelector('style[data-syntagma-hide-cursor]');
      expect(cursorStyle).toBeTruthy();
      return 'done';
    });

    expect(result).toBe('done');
    expect(overlay.style.visibility).toBe('visible');
    expect(document.querySelector('style[data-syntagma-hide-cursor]')).toBeNull();
  });

  it('restores overlay/cursor even when capture throws', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    const overlay = document.createElement('div');
    overlay.style.visibility = 'visible';
    document.body.appendChild(overlay);

    await expect(
      withSuppressedOverlayAndCursor(overlay, async () => {
        throw new Error('capture failed');
      }),
    ).rejects.toThrow('capture failed');

    expect(overlay.style.visibility).toBe('visible');
    expect(document.querySelector('style[data-syntagma-hide-cursor]')).toBeNull();
  });
});

describe('video/screenshot-capture: path selection', () => {
  it('uses primary video-frame capture and skips tab capture when primary succeeds', async () => {
    const video = document.createElement('video');
    setVideoDimensions(video, {
      videoWidth: 1280,
      videoHeight: 720,
      rect: makeRect(640, 360),
    });

    mockCanvas({
      context: { drawImage: vi.fn() },
      toDataURLResult: 'data:image/jpeg;base64,primary',
    });

    const captureTabScreenshot = vi.fn(async () => 'data:image/jpeg;base64,tab');

    const result = await captureVideoScreenshotWithFallback({
      video,
      overlayElement: null,
      captureTabScreenshot,
      cropTabScreenshot: async () => 'data:image/jpeg;base64,cropped',
    });

    expect(result).toBe('data:image/jpeg;base64,primary');
    expect(captureTabScreenshot).not.toHaveBeenCalled();
  });

  it('falls back to tab capture when primary frame capture fails', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    const video = document.createElement('video');
    setVideoDimensions(video, {
      videoWidth: 640,
      videoHeight: 360,
      rect: makeRect(640, 360),
    });

    mockCanvas({ context: null });

    const captureTabScreenshot = vi.fn(async () => 'data:image/jpeg;base64,tab');
    const cropTabScreenshot = vi.fn(async () => 'data:image/jpeg;base64,cropped');

    const result = await captureVideoScreenshotWithFallback({
      video,
      overlayElement: document.createElement('div'),
      captureTabScreenshot,
      cropTabScreenshot,
    });

    expect(captureTabScreenshot).toHaveBeenCalledTimes(1);
    expect(cropTabScreenshot).toHaveBeenCalledTimes(1);
    expect(result).toBe('data:image/jpeg;base64,cropped');
  });
});

