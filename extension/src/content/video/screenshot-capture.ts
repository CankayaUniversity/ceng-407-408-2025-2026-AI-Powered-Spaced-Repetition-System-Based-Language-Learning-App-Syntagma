export const DEFAULT_SCREENSHOT_QUALITY = 0.85;

const TEMP_CURSOR_STYLE_ATTR = 'data-syntagma-hide-cursor';

export interface VideoCaptureSize {
  width: number;
  height: number;
}

export interface CaptureVideoScreenshotOptions {
  video: HTMLVideoElement;
  overlayElement: HTMLElement | null;
  captureTabScreenshot: () => Promise<string | undefined>;
  quality?: number;
  cropTabScreenshot?: (
    dataUrl: string,
    video: HTMLVideoElement,
    quality: number,
  ) => Promise<string | null>;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getVideoCaptureSize(video: HTMLVideoElement): VideoCaptureSize | null {
  const intrinsicWidth = Math.round(video.videoWidth || 0);
  const intrinsicHeight = Math.round(video.videoHeight || 0);
  if (intrinsicWidth > 0 && intrinsicHeight > 0) {
    return { width: intrinsicWidth, height: intrinsicHeight };
  }

  const rect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (width <= 0 || height <= 0) return null;

  return { width, height };
}

export function captureVideoFrame(
  video: HTMLVideoElement,
  quality = DEFAULT_SCREENSHOT_QUALITY,
): string | null {
  const size = getVideoCaptureSize(video);
  if (!size) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, size.width, size.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

export async function withSuppressedOverlayAndCursor<T>(
  overlayElement: HTMLElement | null,
  task: () => Promise<T>,
): Promise<T> {
  const previousOverlayVisibility = overlayElement?.style.visibility ?? '';
  const cursorStyleEl = document.createElement('style');
  cursorStyleEl.setAttribute(TEMP_CURSOR_STYLE_ATTR, '');
  cursorStyleEl.textContent = '*, *::before, *::after { cursor: none !important; }';

  try {
    if (overlayElement) {
      overlayElement.style.visibility = 'hidden';
    }
    (document.head || document.documentElement).appendChild(cursorStyleEl);
    await nextAnimationFrame();
    return await task();
  } finally {
    if (overlayElement) {
      if (previousOverlayVisibility) {
        overlayElement.style.visibility = previousOverlayVisibility;
      } else {
        overlayElement.style.removeProperty('visibility');
      }
    }
    if (cursorStyleEl.parentNode) {
      cursorStyleEl.parentNode.removeChild(cursorStyleEl);
    }
  }
}

export async function cropScreenshotToVideoBounds(
  dataUrl: string,
  video: HTMLVideoElement,
  quality = DEFAULT_SCREENSHOT_QUALITY,
): Promise<string | null> {
  const videoRect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  const srcX = Math.round(videoRect.left * dpr);
  const srcY = Math.round(videoRect.top * dpr);
  const srcWidth = Math.round(videoRect.width * dpr);
  const srcHeight = Math.round(videoRect.height * dpr);
  if (srcWidth <= 0 || srcHeight <= 0) return null;

  return new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const x = clamp(srcX, 0, img.width);
        const y = clamp(srcY, 0, img.height);
        const maxWidth = Math.max(0, img.width - x);
        const maxHeight = Math.max(0, img.height - y);
        const width = clamp(srcWidth, 0, maxWidth);
        const height = clamp(srcHeight, 0, maxHeight);
        if (width <= 0 || height <= 0) {
          resolve(null);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(
          img,
          x, y, width, height,
          0, 0, width, height,
        );
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function captureVideoScreenshotWithFallback({
  video,
  overlayElement,
  captureTabScreenshot,
  quality = DEFAULT_SCREENSHOT_QUALITY,
  cropTabScreenshot = cropScreenshotToVideoBounds,
}: CaptureVideoScreenshotOptions): Promise<string | undefined> {
  const frameDataUrl = captureVideoFrame(video, quality);
  if (frameDataUrl) return frameDataUrl;

  const tabDataUrl = await withSuppressedOverlayAndCursor(overlayElement, captureTabScreenshot);
  if (!tabDataUrl) return undefined;

  const cropped = await cropTabScreenshot(tabDataUrl, video, quality);
  return cropped ?? tabDataUrl;
}

