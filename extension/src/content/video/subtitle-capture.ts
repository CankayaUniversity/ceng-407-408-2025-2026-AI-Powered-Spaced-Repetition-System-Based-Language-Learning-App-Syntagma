import type { SubtitleCue } from '../../shared/types';
import { parseVTT } from './subtitle-parser';
import {
  fetchNetflixSubtitlesFromManifest,
  normalizeNetflixCues,
} from './netflix-subtitles';
import {
  extractCaptionTracksFromDocument,
  extractYoutubeSubtitles,
  extractYoutubeVideoId,
  type YoutubeSubtitleSegment,
} from '../youtube-subtitles';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function getVideoId(): string | null {
  return new URLSearchParams(window.location.search).get('v');
}

// ─── Shared post-processing ───────────────────────────────────────────────────

// When cues overlap (cue[i].endMs > cue[i+1].startMs), findCueAt returns the
// earlier cue until its endMs — causing the active highlight to switch late.
// Truncate each cue's endMs to the next cue's startMs to ensure clean transitions.
function trimOverlaps(cues: SubtitleCue[]): void {
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].endMs > cues[i + 1].startMs) {
      cues[i].endMs = cues[i + 1].startMs;
    }
  }
}

// ─── Multi-source ytInitialPlayerResponse reader ─────────────────────────────

function mapSegmentsToSubtitleCues(segments: YoutubeSubtitleSegment[]): SubtitleCue[] {
  const cues = segments
    .map((segment, index) => {
      const startMs = Math.max(0, segment.startMs);
      const durationMs = Math.max(0, segment.durationMs || 0);
      const endMs = Math.max(startMs + 1, startMs + durationMs);
      const text = (segment.text ?? '').trim();
      if (!text) return null;
      return {
        index,
        startMs,
        endMs,
        text,
        rawText: text,
        bookmarked: false,
        selected: false,
      } as SubtitleCue;
    })
    .filter((cue): cue is SubtitleCue => cue !== null);
  trimOverlaps(cues);
  return cues;
}

// ─── YouTube JSON3 subtitle format parser ────────────────────────────────────
// YouTube's timedtext API can return JSON3 format — more structured than VTT.

interface Json3Event {
  tStartMs: number;
  dDurationMs?: number;
  segs?: Array<{ utf8: string }>;
}

function parseJson3(text: string): SubtitleCue[] {
  // YouTube ASR JSON3 uses a rolling-window format: each event appends one word
  // to the current caption line, and a bare "\n" event marks a line boundary.
  // We must group events into lines; otherwise each word becomes its own cue.
  try {
    const data = JSON.parse(text) as { events?: Json3Event[] };
    if (!data.events) return [];

    const cues: SubtitleCue[] = [];
    let lineStart = -1;
    let lineEnd   = -1;
    let lineText  = '';

    const flush = () => {
      const clean = lineText.replace(/\s+/g, ' ').trim();
      if (clean && lineStart >= 0) {
        cues.push({
          index: cues.length,
          startMs: lineStart,
          endMs: Math.max(lineStart + 500, lineEnd),
          text: clean,
          rawText: clean,
          bookmarked: false,
          selected: false,
        });
      }
      lineStart = -1;
      lineEnd   = -1;
      lineText  = '';
    };

    for (const ev of data.events) {
      if (!ev.segs) continue;
      const seg = ev.segs.map(s => s.utf8 ?? '').join('');

      // Bare newline = sentence boundary
      if (seg === '\n') { flush(); continue; }

      const piece = seg.replace(/\n/g, ' ');
      if (!piece.trim()) continue;

      if (lineStart < 0) lineStart = ev.tStartMs;
      lineText += piece;
      lineEnd = ev.tStartMs + (ev.dDurationMs ?? 3000);
    }
    flush(); // emit last line
    trimOverlaps(cues);
    return cues;
  } catch {
    return [];
  }
}

// ─── Direct timedtext API (no signature required) ────────────────────────────
// YouTube's timedtext endpoint works without authentication for public videos.
// Tries several URL variants: manual captions, ASR (auto-generated), both formats.

async function fetchViaTimedtextApi(videoId: string, lang: string): Promise<SubtitleCue[]> {
  // First: try to discover available tracks via the list endpoint
  const trackNames: Array<{ name: string; kind: string }> = [
    { name: '', kind: '' },       // unnamed manual caption
    { name: '', kind: 'asr' },    // auto-generated
  ];

  try {
    const listResp = await fetch(
      `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`
    );
    if (listResp.ok) {
      const xml = await listResp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      // Insert discovered tracks at the front so they're tried first
      doc.querySelectorAll('track').forEach(el => {
        const code = el.getAttribute('lang_code') ?? '';
        if (code.startsWith(lang) || code === '') {
          trackNames.unshift({
            name: el.getAttribute('name') ?? '',
            kind: el.getAttribute('kind') ?? '',
          });
        }
      });
    }
  } catch { /* list endpoint failed, fall through to hardcoded variants */ }

  // Build candidate URL list (JSON3 preferred, VTT fallback)
  const urls: string[] = [];
  for (const { name, kind } of trackNames) {
    const base = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`;
    const suffix = (name ? `&name=${encodeURIComponent(name)}` : '') + (kind ? `&kind=${kind}` : '');
    urls.push(`${base}&fmt=json3${suffix}`);
    urls.push(`${base}&fmt=vtt${suffix}`);
  }

  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text || text.length < 20) continue;

      if (url.includes('fmt=json3')) {
        const cues = parseJson3(text);
        if (cues.length > 0) return cues;
      }
      if (url.includes('fmt=vtt') && text.includes('WEBVTT')) {
        const cues = parseVTT(text);
        if (cues.length > 0) return cues;
      }
    } catch { /* next url */ }
  }

  return [];
}

// ─── video.textTracks full-cue extraction ────────────────────────────────────

export function extractTextTrackCues(track: TextTrack): SubtitleCue[] {
  if (!track.cues || track.cues.length === 0) return [];
  const cues: SubtitleCue[] = [];
  for (let i = 0; i < track.cues.length; i++) {
    const c = track.cues[i] as VTTCue;
    const text = c.text?.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim() ?? '';
    if (text) {
      cues.push({
        index: i,
        startMs: Math.round(c.startTime * 1000),
        endMs:   Math.round(c.endTime   * 1000),
        text, rawText: c.text,
        bookmarked: false, selected: false,
      });
    }
  }
  return cues;
}

async function captureViaTextTracks(video: HTMLVideoElement, lang: string, waitMs = 4000): Promise<SubtitleCue[]> {
  const all = Array.from(video.textTracks);
  if (!all.length) return [];

  const target =
    all.find(t => t.language.startsWith(lang) && t.mode !== 'disabled') ??
    all.find(t => t.language.startsWith(lang)) ??
    all.find(t => t.kind === 'subtitles' || t.kind === 'captions') ??
    all[0];

  if (!target) return [];
  if (target.mode === 'disabled') target.mode = 'hidden';

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const cues = extractTextTrackCues(target);
    if (cues.length > 0) return cues;
    await sleep(300);
  }
  return [];
}

// ─── Public: one-shot full-transcript capture ─────────────────────────────────

/**
 * Tries every available method in priority order to fetch the complete
 * subtitle transcript for the current YouTube video.
 *
 * Method 1 – Direct timedtext API (no auth; timestamps match the web player).
 * Method 2 – ytInitialPlayerResponse / InnerTube (retried up to remaining
 *            wait time to handle race conditions with page load).
 * Method 3 – video.textTracks (works when user has CC already enabled).
 */
export async function captureYouTubeSubtitles(
  lang: 'en' | 'tr',
  maxWaitMs = 15000,
): Promise<SubtitleCue[]> {
  const videoId =
    extractYoutubeVideoId(window.location.href) ??
    getVideoId();
  const deadline = Date.now() + maxWaitMs;

  // ── Method 1: Direct timedtext API (accurate web-player timestamps) ──────
  // Tried first because its timestamps are aligned with the web player,
  // avoiding the ~2–3 s offset sometimes present in InnerTube Android data.
  if (videoId) {
    try {
      const cues = await fetchViaTimedtextApi(videoId, lang);
      if (cues.length > 0) return cues;
    } catch { /* fall through to InnerTube */ }
  }

  // ── Method 2: InnerTube extractor (retried for early page-load races) ────
  while (Date.now() < deadline) {
    try {
      const result = await extractYoutubeSubtitles({
        videoUrlOrId: window.location.href,
        preferredLang: lang,
        doc: document,
      });

      const cues = mapSegmentsToSubtitleCues(result.segments);
      if (cues.length > 0) {
        return cues;
      }
    } catch {
      // Retry until timeout for early page-load race conditions.
    }
    await sleep(600);
  }

  // ── Method 3: video.textTracks (user has CC enabled already) ────────────
  const video =
    document.querySelector<HTMLVideoElement>('.html5-main-video') ??
    document.querySelector<HTMLVideoElement>('#movie_player video') ??
    document.querySelector<HTMLVideoElement>('video');

  if (video) {
    const cues = await captureViaTextTracks(video, lang);
    if (cues.length > 0) return cues;
  }

  return [];
}

export function getYouTubeAvailableLanguages(): string[] {
  try {
    const tracks = extractCaptionTracksFromDocument(document);
    return [...new Set(tracks.map((track) => track.languageCode))];
  } catch {
    return [];
  }
}

// ─── Public: watch TextTracks for progressive transcript building ─────────────

export function watchTextTracksForFullTranscript(
  video: HTMLVideoElement,
  lang: string,
  onUpdate: (cues: SubtitleCue[]) => void,
): () => void {
  const cleanups: Array<() => void> = [];
  let knownCount = 0;

  const tryAttach = (track: TextTrack) => {
    const matchesLang =
      !track.language ||
      track.language.startsWith(lang) ||
      track.kind === 'subtitles' ||
      track.kind === 'captions';
    if (!matchesLang) return;
    if (track.mode === 'disabled') track.mode = 'hidden';

    const flush = () => {
      const cues = extractTextTrackCues(track);
      if (cues.length > knownCount) {
        knownCount = cues.length;
        onUpdate(cues);
      }
    };

    track.addEventListener('cuechange', flush);
    const timer = setInterval(flush, 2000);
    cleanups.push(() => {
      track.removeEventListener('cuechange', flush);
      clearInterval(timer);
    });
    flush();
  };

  Array.from(video.textTracks).forEach(tryAttach);

  const onAddTrack = (e: TrackEvent) => { if (e.track) tryAttach(e.track); };
  video.textTracks.addEventListener('addtrack', onAddTrack);
  cleanups.push(() => video.textTracks.removeEventListener('addtrack', onAddTrack));

  return () => cleanups.forEach(fn => fn());
}

// ─── Generic DOM subtitle observer ───────────────────────────────────────────

function observeSubtitleContainer(
  container: Element,
  onCueAppear: (text: string) => void,
  onCueDisappear: () => void,
): () => void {
  let lastText = '';
  const flush = () => {
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    // Fall back to textContent to bypass CSS visibility rules
    const text = clone.textContent?.trim() ?? '';
    if (text && text !== lastText) { lastText = text; onCueAppear(text); }
    else if (!text && lastText) { lastText = ''; onCueDisappear(); }
  };
  const observer = new MutationObserver(flush);
  observer.observe(container, { childList: true, subtree: true, characterData: true });
  flush();
  return () => observer.disconnect();
}

export function observeYouTubeCaptions(
  onCueAppear: (text: string) => void,
  onCueDisappear: () => void,
): () => void {
  const container = document.querySelector('.ytp-caption-window-container');
  if (!container) return () => {};
  return observeSubtitleContainer(container, onCueAppear, onCueDisappear);
}

// ─── Netflix subtitle observer ────────────────────────────────────────────────

const NETFLIX_SUBTITLE_SELECTORS = [
  '.player-timedtext',
  '.nf-player-timedtext',
  '[data-uia="player-timedtext"]',
  '.player-timedtext-text-container',
  '.watch-video--bottom-controls-container',
];

function observeViaTextTrack(
  video: HTMLVideoElement,
  onCueAppear: (text: string) => void,
  onCueDisappear: () => void,
  onAllCuesReady?: (cues: SubtitleCue[]) => void,
): (() => void) | null {
  const listeners: Array<() => void> = [];

  const attachTrack = (track: TextTrack) => {
    const isActive  = track.mode === 'showing' || track.mode === 'hidden';
    const isEnglish = track.language === '' || track.language.startsWith('en');
    if (!isActive && !isEnglish) return;
    if (track.mode === 'disabled') track.mode = 'hidden';

    let lastAllCuesLength = 0;
    const handler = () => {
      const activeCues = track.activeCues;
      if (activeCues && activeCues.length > 0) {
        const text = Array.from(activeCues).map(c => (c as VTTCue).text ?? '').join('\n').trim();
        if (text) onCueAppear(text); else onCueDisappear();
      } else {
        onCueDisappear();
      }
      if (onAllCuesReady && track.cues && track.cues.length !== lastAllCuesLength) {
        lastAllCuesLength = track.cues.length;
        const all = extractTextTrackCues(track);
        if (all.length > 0) onAllCuesReady(all);
      }
    };
    track.addEventListener('cuechange', handler);

    // Poll track.cues until they are fully populated. TextTrack cues on Netflix
    // may load asynchronously after the track is attached; polling catches the
    // moment when the full transcript becomes available.
    const pollTimer = setInterval(() => {
      if (onAllCuesReady && track.cues && track.cues.length !== lastAllCuesLength) {
        lastAllCuesLength = track.cues.length;
        const all = extractTextTrackCues(track);
        if (all.length > 0) onAllCuesReady(all);
      }
    }, 1000);

    listeners.push(() => {
      track.removeEventListener('cuechange', handler);
      clearInterval(pollTimer);
    });
    handler();
  };

  Array.from(video.textTracks).forEach(attachTrack);
  if (listeners.length === 0) return null;
  return () => listeners.forEach(fn => fn());
}

function observeViaDOM(
  video: HTMLVideoElement,
  onCueAppear: (text: string) => void,
  onCueDisappear: () => void,
  onAllCuesReady?: (cues: SubtitleCue[]) => void,
): (() => void) | null {
  const subtitleSelectors = NETFLIX_SUBTITLE_SELECTORS.filter(s => !s.includes('controls'));
  const playerRoot =
    document.querySelector<HTMLElement>('.watch-video--player-view') ??
    document.querySelector<HTMLElement>('.NFPlayer') ??
    document.querySelector<HTMLElement>('.watch-video');
  if (!playerRoot) return null;

  let lastText = '';
  const capturedCues: SubtitleCue[] = [];

  const flush = () => {
    let text = '';
    for (const sel of subtitleSelectors) {
      const el = playerRoot.querySelector<HTMLElement>(sel);
      if (el) {
        // Use innerHTML-based extraction instead of cloneNode(true) to avoid
        // deep DOM cloning on every mutation (Netflix fires many per second).
        text = el.innerHTML
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
          .trim();
        if (text) break;
      }
    }
    
    const currentMs = Math.round(video.currentTime * 1000);

    if (text && text !== lastText) { 
      lastText = text; 
      onCueAppear(text); 
      
      const isReappearance = capturedCues.length > 0 && capturedCues[capturedCues.length - 1].text === text;
      
      if (!isReappearance) {
        if (capturedCues.length > 0) {
           capturedCues[capturedCues.length - 1].endMs = currentMs;
        }
        capturedCues.push({
          index: capturedCues.length,
          startMs: currentMs,
          endMs: currentMs + 5000,
          text: text,
          rawText: text,
          bookmarked: false,
          selected: false
        });
        // Ensure chronological order
        capturedCues.sort((a, b) => a.startMs - b.startMs);
        capturedCues.forEach((c, i) => c.index = i);
        onAllCuesReady?.([...capturedCues]);
      } else {
        capturedCues[capturedCues.length - 1].endMs = currentMs + 5000;
      }
    }
    else if (!text && lastText) { 
      lastText = ''; 
      onCueDisappear(); 
      if (capturedCues.length > 0) {
        capturedCues[capturedCues.length - 1].endMs = Math.round(video.currentTime * 1000);
      }
      onAllCuesReady?.([...capturedCues]);
    }
  };
  const observer = new MutationObserver(flush);
  observer.observe(playerRoot, { childList: true, subtree: true, characterData: true });
  flush();
  return () => observer.disconnect();
}

// ─── Netflix manifest bridge ───────────────────────────────────────────────────

const NETFLIX_MANIFEST_EVENT = 'syntagma:netflix-manifest';
const NETFLIX_CUES_EVENT = 'syntagma:netflix-cues';
const NETFLIX_REQUEST_EVENT = 'syntagma:request-subtitles';
const NETFLIX_UNAVAILABLE_EVENT = 'syntagma:netflix-subtitles-unavailable';
const NETFLIX_MANIFEST_CACHE_ID = 'syntagma-netflix-manifest-cache';
const NETFLIX_CUES_CACHE_ID = 'syntagma-netflix-cues-cache';
const NETFLIX_CONTENT_SOURCE = 'syntagma-content';

function manifestFromEvent(e: Event): unknown | null {
  const detail = (e as CustomEvent<{ manifestJson?: string; manifest?: unknown }>).detail;
  if (!detail) return null;
  if (detail.manifestJson) {
    try { return JSON.parse(detail.manifestJson); } catch { return null; }
  }
  return detail.manifest ?? null;
}

function readCachedNetflixManifest(): unknown | null {
  const cacheEl = document.getElementById(NETFLIX_MANIFEST_CACHE_ID);
  const cachedJson = cacheEl?.getAttribute('data-manifest');
  if (!cachedJson) return null;
  try { return JSON.parse(cachedJson); } catch { return null; }
}

function readCachedNetflixCues(): SubtitleCue[] {
  const cacheEl = document.getElementById(NETFLIX_CUES_CACHE_ID);
  const cachedJson = cacheEl?.getAttribute('data-cues');
  if (!cachedJson) return [];
  try {
    const raw = JSON.parse(cachedJson) as SubtitleCue[];
    return Array.isArray(raw) ? normalizeNetflixCues(raw) : [];
  } catch {
    return [];
  }
}

function writeCachedNetflixCues(cues: SubtitleCue[]): void {
  try {
    let cacheEl = document.getElementById(NETFLIX_CUES_CACHE_ID);
    if (!cacheEl) {
      cacheEl = document.createElement('div');
      cacheEl.id = NETFLIX_CUES_CACHE_ID;
      cacheEl.style.display = 'none';
      (document.body || document.documentElement).appendChild(cacheEl);
    }
    cacheEl.setAttribute('data-cues', JSON.stringify(cues));
  } catch {
    // Cache is only for race recovery; failing to write it should not break playback.
  }
}

export function observeNetflixCaptions(
  video: HTMLVideoElement,
  onCueAppear: (text: string) => void,
  onCueDisappear: () => void,
  onAllCuesReady?: (cues: SubtitleCue[]) => void,
): () => void {
  let stopFn: (() => void) | null = null;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let netflixCues: SubtitleCue[] = [];
  let fallbackCueCount = 0;

  const publishCues = (incoming: SubtitleCue[]) => {
    if (disposed || incoming.length === 0) return;
    const combined = normalizeNetflixCues([...netflixCues, ...incoming]);
    if (combined.length <= netflixCues.length) return;

    netflixCues = combined;
    writeCachedNetflixCues(netflixCues);
    onAllCuesReady?.(netflixCues);
    window.dispatchEvent(new CustomEvent(NETFLIX_CUES_EVENT, {
      detail: {
        source: NETFLIX_CONTENT_SOURCE,
        cues: netflixCues.map(({ startMs, endMs, text }) => ({ startMs, endMs, text })),
      },
    }));
    console.log('[Syntagma] Full Netflix transcript ready: ' + netflixCues.length + ' cues.');
  };

  const fetchFromManifest = (manifest: unknown) => {
    fetchNetflixSubtitlesFromManifest(manifest, { preferredLang: 'en', debug: true })
      .then((cues) => {
        if (disposed) return;
        if (cues.length > 0) {
          publishCues(cues);
          return;
        }
        if (netflixCues.length === 0) {
          window.dispatchEvent(new CustomEvent(NETFLIX_UNAVAILABLE_EVENT));
        }
      })
      .catch(() => {
        if (!disposed && netflixCues.length === 0) {
          window.dispatchEvent(new CustomEvent(NETFLIX_UNAVAILABLE_EVENT));
        }
      });
  };

  const handleManifest = (e: Event) => {
    const manifest = manifestFromEvent(e);
    if (manifest) fetchFromManifest(manifest);
  };
  window.addEventListener(NETFLIX_MANIFEST_EVENT, handleManifest);

  const handleParsedCues = (e: Event) => {
    const detail = (e as CustomEvent<{ source?: string; cues?: Array<{ startMs: number; endMs: number; text: string }> }>).detail;
    if (detail?.source === NETFLIX_CONTENT_SOURCE || !detail?.cues?.length) return;
    publishCues(detail.cues.map((cue, index) => ({
      index,
      startMs: cue.startMs,
      endMs: cue.endMs,
      text: cue.text,
      rawText: cue.text,
      bookmarked: false,
      selected: false,
    })));
  };
  window.addEventListener(NETFLIX_CUES_EVENT, handleParsedCues);

  const cachedCues = readCachedNetflixCues();
  if (cachedCues.length > 0) {
    publishCues(cachedCues);
  }

  const cachedManifest = readCachedNetflixManifest();
  if (cachedManifest) {
    fetchFromManifest(cachedManifest);
  }

  requestTimer = setTimeout(() => {
    requestTimer = null;
    if (netflixCues.length === 0) {
      window.dispatchEvent(new CustomEvent(NETFLIX_REQUEST_EVENT));
    }
  }, 1500);

  const safeOnAllCuesReady = (cues: SubtitleCue[]) => {
    if (netflixCues.length > 0 || cues.length <= fallbackCueCount) return;
    fallbackCueCount = cues.length;
    onAllCuesReady?.(normalizeNetflixCues(cues));
  };

  const tryAttach = () => {
    const ttCleanup = observeViaTextTrack(video, onCueAppear, onCueDisappear, safeOnAllCuesReady);
    if (ttCleanup) { stopFn = ttCleanup; return; }
    const domCleanup = observeViaDOM(video, onCueAppear, onCueDisappear, safeOnAllCuesReady);
    if (domCleanup) { stopFn = domCleanup; return; }
    if (attempts++ < 24) timer = setTimeout(tryAttach, 500);
  };

  const onAddTrack = () => {
    stopFn?.(); stopFn = null; attempts = 0;
    if (timer) { clearTimeout(timer); timer = null; }
    tryAttach();
  };
  video.textTracks.addEventListener('addtrack', onAddTrack);
  tryAttach();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    if (requestTimer) clearTimeout(requestTimer);
    stopFn?.();
    video.textTracks.removeEventListener('addtrack', onAddTrack);
    window.removeEventListener(NETFLIX_MANIFEST_EVENT, handleManifest);
    window.removeEventListener(NETFLIX_CUES_EVENT, handleParsedCues);
  };
}
