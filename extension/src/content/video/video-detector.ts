export type VideoPlatform = 'youtube' | 'netflix';

export interface VideoContext {
  platform: VideoPlatform;
  video: HTMLVideoElement;
  container: HTMLElement;
}

function findPositionedAncestor(el: HTMLElement): HTMLElement {
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur !== document.body) {
    const pos = getComputedStyle(cur).position;
    if (pos === 'relative' || pos === 'absolute' || pos === 'fixed' || pos === 'sticky') {
      return cur;
    }
    cur = cur.parentElement;
  }
  return el.parentElement ?? document.body;
}

export function detectVideoContext(): VideoContext | null {
  const url = window.location.href;

  // ── YouTube ──────────────────────────────────────────────────────────────
  if (url.includes('youtube.com/watch')) {
    const video =
      document.querySelector<HTMLVideoElement>('.html5-main-video') ??
      document.querySelector<HTMLVideoElement>('#movie_player video') ??
      document.querySelector<HTMLVideoElement>('video');
    const container =
      document.querySelector<HTMLElement>('#movie_player') ??
      (video ? findPositionedAncestor(video) : null);
    if (video && container) return { platform: 'youtube', video, container };
  }

  // ── Netflix ───────────────────────────────────────────────────────────────
  if (url.includes('netflix.com/watch')) {
    const video = document.querySelector<HTMLVideoElement>('video');
    const container =
      document.querySelector<HTMLElement>('.watch-video--player-view') ??
      document.querySelector<HTMLElement>('.NFPlayer') ??
      (video ? findPositionedAncestor(video) : null);
    if (video && container) return { platform: 'netflix', video, container };
  }

  return null;
}

/** Poll for a video context, useful for SPAs where the video element loads late. */
export async function waitForVideoContext(timeoutMs = 12000): Promise<VideoContext | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ctx = detectVideoContext();
    if (ctx) return ctx;
    await new Promise(r => setTimeout(r, 600));
  }
  return null;
}
