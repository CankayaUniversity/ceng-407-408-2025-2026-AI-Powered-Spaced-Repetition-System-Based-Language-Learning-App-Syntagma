import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { UserSettings, LexemeEntry, WordStatus, SubtitleCue } from '../../shared/types';
import { waitForVideoContext } from './video-detector';
import { VideoOverlay } from './VideoOverlay';
import { VideoSidebarPanel, SIDEBAR_WIDTH } from './VideoSidebarPanel';

// ─── Shadow DOM styles ────────────────────────────────────────────────────────

const SHADOW_CSS = `
  *, *::before, *::after { box-sizing: border-box; }

  input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: rgba(255,255,255,0.18);
    outline: none;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #E9C46A;
    cursor: pointer;
    border: none;
  }
  select { outline: none; }
  button { outline: none; font-family: inherit; }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 2px; }
`;

// ─── State ────────────────────────────────────────────────────────────────────

let videoRoot: ReturnType<typeof createRoot> | null = null;
let shadowHost: HTMLElement | null = null;
let sidebarRoot: ReturnType<typeof createRoot> | null = null;
let sidebarHost: HTMLElement | null = null;
let cleanupFn: (() => void) | null = null;

// Tracks whether video mode is currently active.
// Used to respond to late-arriving queries from the header bar.
let videoModeActive = false;

// When the header bar mounts after video mode is already active it dispatches
// this event. Respond immediately so the CC button appears right away.
window.addEventListener('syntagma:query-video-mode', () => {
  if (videoModeActive) {
    window.dispatchEvent(new CustomEvent('syntagma:video-mode-enter'));
  }
});

// ─── YouTube layout injection ─────────────────────────────────────────────────
// When the sidebar is open on YouTube, push the page content left so the video
// sits side-by-side with the sidebar instead of hiding behind it.

let layoutStyleEl: HTMLStyleElement | null = null;

function injectPlatformLayout(): void {
  if (layoutStyleEl) return;
  const isYouTube = window.location.hostname.includes('youtube.com');
  const isNetflix = window.location.hostname.includes('netflix.com');
  
  if (!isYouTube && !isNetflix) return;

  layoutStyleEl = document.createElement('style');
  layoutStyleEl.id = 'syntagma-sidebar-layout';
  
  if (isYouTube) {
    layoutStyleEl.textContent = [
      /* Non-theater mode — constrain the primary column so sidebar sits next to it */
      `ytd-watch-flexy:not([theater]):not([full-bleed-player]) #primary.ytd-watch-flexy {`,
      `  max-width: calc(100% - ${SIDEBAR_WIDTH}px) !important;`,
      `}`,
      /* Theater mode — narrow the player container */
      `ytd-watch-flexy[theater] #player-theater-container,`,
      `ytd-watch-flexy[full-bleed-player] #player-theater-container {`,
      `  padding-right: ${SIDEBAR_WIDTH}px !important;`,
      `  box-sizing: border-box !important;`,
      `}`,
      /* Keep YouTube's own masthead from stretching under the sidebar */
      `#masthead-container { padding-right: ${SIDEBAR_WIDTH}px !important; }`,
    ].join('\n');
  } else if (isNetflix) {
    layoutStyleEl.textContent = [
      `.watch-video--player-view {`,
      `  width: calc(100% - ${SIDEBAR_WIDTH}px) !important;`,
      `}`,
    ].join('\n');
  }
  document.head.appendChild(layoutStyleEl);
}

function removePlatformLayout(): void {
  layoutStyleEl?.remove();
  layoutStyleEl = null;
}

window.addEventListener('syntagma:sidebar-visible', injectPlatformLayout);
window.addEventListener('syntagma:sidebar-hidden',  removePlatformLayout);
// ─── Sidebar renderer ─────────────────────────────────────────────────────────

function renderSidebar(
  video: HTMLVideoElement,
  cues: SubtitleCue[],
  params: VideoModeParams,
): void {
  if (!sidebarHost) {
    sidebarHost = document.createElement('div');
    sidebarHost.id = 'syntagma-sidebar-root';
    sidebarHost.setAttribute('data-syntagma', '');
    document.body.appendChild(sidebarHost);
  }
  if (!sidebarRoot) sidebarRoot = createRoot(sidebarHost);
  sidebarRoot.render(
    createElement(VideoSidebarPanel, {
      video,
      cues,
      lexemes: params.lexemes,
      settings: params.settings,
      onStatusChange: params.onStatusChange,
    })
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface VideoModeParams {
  settings: UserSettings;
  lexemes: Record<string, LexemeEntry>;
  onStatusChange: (lemma: string, status: WordStatus) => void;
  onSettingsChange: (patch: Partial<UserSettings>) => void;
  onCuesAvailable?: (cues: SubtitleCue[]) => void;
}

export async function initVideoMode(params: VideoModeParams): Promise<void> {
  const ctx = await waitForVideoContext(12000);
  if (!ctx) return;

  const { video, platform } = ctx;

  // ── Mount shadow host on document.body (fixed position) ──────────────────
  // We deliberately bypass the video player's DOM tree.
  // Netflix (and YouTube) both have transparent overlay divs inside their player
  // containers that capture all pointer events. Mounting inside those containers
  // means our word spans will never receive clicks regardless of z-index.
  // Mounting on <body> as `position:fixed` sidesteps the whole stacking context.
  shadowHost = document.createElement('div');
  shadowHost.style.cssText = [
    'position:fixed',
    'top:0', 'left:0',
    'width:0', 'height:0',          // sized to video via syncPosition()
    'z-index:2147483645',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(shadowHost);

  // ── Keep host rect in sync with the video element ────────────────────────
  const syncPosition = () => {
    if (!shadowHost || !video) return;
    const r = video.getBoundingClientRect();
    // Skip if video is not visible (e.g. tab hidden)
    if (r.width === 0 || r.height === 0) return;
    // position:fixed coords are viewport-relative — no scroll offset needed
    shadowHost.style.left   = `${r.left}px`;
    shadowHost.style.top    = `${r.top}px`;
    shadowHost.style.width  = `${r.width}px`;
    shadowHost.style.height = `${r.height}px`;
  };

  syncPosition();

  const ro = new ResizeObserver(syncPosition);
  ro.observe(video);
  ro.observe(document.documentElement);

  window.addEventListener('scroll',           syncPosition, { passive: true });
  window.addEventListener('resize',           syncPosition, { passive: true });
  document.addEventListener('fullscreenchange', syncPosition);

  // ── Build shadow root ─────────────────────────────────────────────────────
  const shadow = shadowHost.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = SHADOW_CSS;
  shadow.appendChild(styleEl);

  const renderTarget = document.createElement('div');
  renderTarget.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  shadow.appendChild(renderTarget);

  // ── Mount sidebar immediately so the toggle button works right away ─────
  // Sidebar shows an empty/loading state until cues arrive from VideoOverlay.
  renderSidebar(video, [], params);

  // ── Mount React overlay ───────────────────────────────────────────────────
  videoRoot = createRoot(renderTarget);
  videoModeActive = true;
  window.dispatchEvent(new CustomEvent('syntagma:video-mode-enter'));

  videoRoot.render(
    createElement(VideoOverlay, {
      video,
      platform,
      settings: params.settings,
      lexemes: params.lexemes,
      onStatusChange: params.onStatusChange,
      onSettingsChange: params.onSettingsChange,
      onCuesChange: (cues: SubtitleCue[]) => {
        renderSidebar(video, cues, params);
        params.onCuesAvailable?.(cues);
      },
    })
  );

  cleanupFn = () => {
    ro.disconnect();
    window.removeEventListener('scroll',            syncPosition);
    window.removeEventListener('resize',            syncPosition);
    document.removeEventListener('fullscreenchange', syncPosition);
  };
}

export function destroyVideoMode(): void {
  videoModeActive = false;
  window.dispatchEvent(new CustomEvent('syntagma:video-mode-exit'));
  cleanupFn?.();
  cleanupFn = null;
  if (videoRoot) {
    videoRoot.unmount();
    videoRoot = null;
  }
  shadowHost?.remove();
  shadowHost = null;
  if (sidebarRoot) {
    sidebarRoot.unmount();
    sidebarRoot = null;
  }
  sidebarHost?.remove();
  sidebarHost = null;
}
