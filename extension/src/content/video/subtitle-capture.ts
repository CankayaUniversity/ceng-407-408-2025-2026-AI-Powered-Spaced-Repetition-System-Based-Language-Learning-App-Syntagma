import type { SubtitleCue } from '../../shared/types';
import { parseVTT } from './subtitle-parser';
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

// ─── Netflix subtitle interceptor injection ─────────────────────────────────────

export function injectNetflixInterceptor() {
  const id = 'syntagma-netflix-interceptor';
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  // NOTE: This script runs in the page's JS context (not the extension context).
  // It cannot use TypeScript, imports, or chrome.* APIs.
  // Backticks are avoided inside the string to prevent template-literal conflicts.
  script.textContent = `
    (function () {
      if (window.__SYNTAGMA_INTERCEPTOR_ACTIVE__) return;
      window.__SYNTAGMA_INTERCEPTOR_ACTIVE__ = true;

      // ── Helpers ────────────────────────────────────────────────────────────

      function isSubtitleUrl(url) {
        return typeof url === 'string' && url.includes('nflxvideo.net') && url.includes('?o=');
      }

      function isManifestUrl(url) {
        if (typeof url !== 'string') return false;
        if (!url.includes('netflix.com')) return false;
        return url.includes('/playapi/') || url.includes('/cadmium/') || url.includes('/manifest');
      }

      // ── Mini TTML parser (runs entirely inside the page context) ───────────
      // Parses Netflix TTML subtitle files and returns plain cue objects.
      // Handles both tick-based time (e.g. "12345t") and HH:MM:SS.mmm format.
      function parseTTMLtoCues(xml) {
        if (!xml || (!xml.includes('begin=') && !xml.includes('<tt '))) return [];
        var tickRateMatch = xml.match(/ttp:tickRate="(\d+)"/);
        var tickRate = tickRateMatch ? parseInt(tickRateMatch[1], 10) : 10000000;

        function parseTime(str) {
          if (!str) return 0;
          str = str.trim();
          if (str.charAt(str.length - 1) === 't') {
            return Math.round(parseInt(str, 10) / tickRate * 1000);
          }
          if (str.indexOf(':') !== -1) {
            var parts = str.split(':');
            if (parts.length === 3) {
              return Math.round((parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])) * 1000);
            }
          }
          if (str.slice(-2) === 'ms') return parseInt(str, 10);
          if (str.charAt(str.length - 1) === 's') return Math.round(parseFloat(str) * 1000);
          return 0;
        }

        var cues = [];
        var pRegex = /<p[^>]*begin="([^"]*)"[^>]*end="([^"]*)"[^>]*>([\s\S]*?)<\/p>/g;
        var m;
        while ((m = pRegex.exec(xml)) !== null) {
          var startMs = parseTime(m[1]);
          var endMs   = parseTime(m[2]);
          var text = m[3]
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ').trim();
          if (text && endMs > startMs) {
            cues.push({ startMs: startMs, endMs: endMs, text: text });
          }
        }
        return cues;
      }

      // ── Dispatch raw TTML as fallback (for direct nflxvideo.net interception) ─
      function tryDispatchTTML(text, url) {
        if (!text || (!text.includes('begin=') && !text.includes('<tt '))) return;
        window.dispatchEvent(new CustomEvent('syntagma:netflix-transcript', {
          detail: { xml: text, url: url }
        }));
      }

      // ── Extract subtitle download URLs from a Netflix manifest object ──────
      function extractSubtitleUrls(manifest, lang) {
        var tracks = manifest.timedtextTracks ||
                     (manifest.result && manifest.result.timedtextTracks) || [];
        var urls = [];
        var prefLang = lang || 'en';

        // Collect tracks whose language matches the preference; fall back to all
        var matched = tracks.filter(function(t) {
          return (t.language || '').toLowerCase().indexOf(prefLang) === 0;
        });
        if (matched.length === 0) matched = tracks;

        var formatPriority = ['simplesdh', 'nflx-cmisc', 'imsc1.1'];

        matched.forEach(function(track) {
          var dlable = track.ttDownloadables || {};
          // Try preferred formats first, then anything available
          var formats = formatPriority.concat(
            Object.keys(dlable).filter(function(k) { return formatPriority.indexOf(k) === -1; })
          );
          for (var fi = 0; fi < formats.length; fi++) {
            var fmt = formats[fi];
            if (!dlable[fmt]) continue;
            var dlUrls = dlable[fmt].downloadUrls || dlable[fmt].urls || {};
            var found = [];
            Object.keys(dlUrls).forEach(function(k) {
              if (typeof dlUrls[k] === 'string') found.push(dlUrls[k]);
            });
            if (found.length > 0) {
              found.forEach(function(u) { urls.push(u); });
              break; // only first successful format per track
            }
          }
        });
        return urls;
      }

      // ── Fetch all subtitle chunks from manifest and dispatch combined cues ─
      // All chunks are fetched in parallel; the complete transcript is dispatched
      // as a single 'syntagma:netflix-cues' event so the user sees it all at once.
      function fetchAllSubtitlesFromManifest(manifest) {
        var urls = extractSubtitleUrls(manifest, 'en');
        if (urls.length === 0) {
          console.log('[Syntagma] No subtitle URLs found in manifest');
          return;
        }
        console.log('[Syntagma] Fetching ' + urls.length + ' subtitle chunk(s) from manifest...');

        var promises = urls.map(function(url) {
          return fetch(url, { credentials: 'include' })
            .then(function(r) { return r.ok ? r.text() : null; })
            .catch(function() { return null; });
        });

        Promise.all(promises).then(function(texts) {
          var allCues = [];
          var fetched = 0;
          texts.forEach(function(text) {
            if (!text) return;
            var cues = parseTTMLtoCues(text);
            if (cues.length > 0) { allCues = allCues.concat(cues); fetched++; }
          });

          if (allCues.length === 0) {
            console.log('[Syntagma] Manifest fetch returned no parseable cues');
            return;
          }

          // Sort and deduplicate by startMs
          allCues.sort(function(a, b) { return a.startMs - b.startMs; });
          allCues = allCues.filter(function(c, i) {
            return i === 0 || c.startMs !== allCues[i - 1].startMs;
          });

          console.log('[Syntagma] Full transcript ready: ' + allCues.length + ' cues from ' + fetched + ' chunk(s)');
          window.dispatchEvent(new CustomEvent('syntagma:netflix-cues', {
            detail: { cues: allCues }
          }));
          // Cache cues in DOM so late-arriving content script listeners can still read them.
          // The content script runs in an isolated world and cannot share window variables,
          // but both contexts can access DOM elements.
          try {
            var cacheEl = document.getElementById('syntagma-netflix-cues-cache');
            if (!cacheEl) {
              cacheEl = document.createElement('div');
              cacheEl.id = 'syntagma-netflix-cues-cache';
              cacheEl.style.display = 'none';
              document.body.appendChild(cacheEl);
            }
            cacheEl.setAttribute('data-cues', JSON.stringify(allCues));
          } catch(cacheErr) {}
        }).catch(function(e) {
          console.log('[Syntagma] Manifest subtitle fetch error:', e);
        });
      }

      // ── Try to parse a response body as a Netflix manifest ─────────────────
      function tryProcessManifest(text) {
        try {
          var data = JSON.parse(text);
          if (data && (data.timedtextTracks || (data.result && data.result.timedtextTracks))) {
            fetchAllSubtitlesFromManifest(data);
          }
        } catch (e) { /* not a manifest JSON */ }
      }

      // ── On-demand subtitle fetch from player state ─────────────────────────
      // Called by the content script when no cues were captured via interception
      // (e.g. extension installed while video was already playing, or subtitles
      // enabled after page load). Searches the Netflix player's internal memory
      // for timedtextTracks metadata and re-fetches the TTML files directly.
      function tryGetManifestFromPlayerState() {
        var getPlayerFns = [
          function() {
            var vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
            return vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds()[0]);
          },
          function() {
            var vp = window.netflix.appContext.getState().playerApp.getAPI().videoPlayer;
            return vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds()[0]);
          },
        ];

        for (var gi = 0; gi < getPlayerFns.length; gi++) {
          try {
            var player = getPlayerFns[gi]();
            if (!player) continue;

            // Search one and two levels deep for an object containing timedtextTracks.
            // Netflix stores the manifest in e.g. player._controller._impl.state.manifest
            // but the exact path changes across versions — we scan shallowly instead.
            for (var k1 in player) {
              try {
                var v1 = player[k1];
                if (!v1 || typeof v1 !== 'object') continue;
                if (v1.timedtextTracks) return { timedtextTracks: v1.timedtextTracks };
                for (var k2 in v1) {
                  try {
                    var v2 = v1[k2];
                    if (!v2 || typeof v2 !== 'object') continue;
                    if (v2.timedtextTracks) return { timedtextTracks: v2.timedtextTracks };
                    for (var k3 in v2) {
                      try {
                        var v3 = v2[k3];
                        if (v3 && typeof v3 === 'object' && v3.timedtextTracks) {
                          return { timedtextTracks: v3.timedtextTracks };
                        }
                      } catch(e3) {}
                    }
                  } catch(e2) {}
                }
              } catch(e1) {}
            }
          } catch(eg) {}
        }
        return null;
      }

      window.addEventListener('syntagma:request-subtitles', function() {
        console.log('[Syntagma] On-demand subtitle fetch requested...');
        var manifest = tryGetManifestFromPlayerState();
        if (manifest && manifest.timedtextTracks && manifest.timedtextTracks.length > 0) {
          console.log('[Syntagma] Found timedtextTracks in player state, fetching...');
          fetchAllSubtitlesFromManifest(manifest);
        } else {
          console.warn('[Syntagma] No timedtextTracks found in player state.');
          window.dispatchEvent(new CustomEvent('syntagma:netflix-subtitles-unavailable'));
        }
      });

      // ── Netflix player seek helper ─────────────────────────────────────────
      // Tries several Netflix internal API paths (they differ across versions).
      // Never falls back to video.currentTime — touching the DRM video element
      // directly causes Netflix error M7375 (EME state violation).
      window.addEventListener('syntagma:netflix-seek', function(e) {
        var timeMs = e.detail.timeMs;
        var seeked = false;

        // Netflix internal API — try multiple known path variants
        var apiFns = [
          function() {
            var vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
            vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds()[0]).seek(timeMs);
          },
          function() {
            var vp = window.netflix.appContext.getState().playerApp.getAPI().videoPlayer;
            vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds()[0]).seek(timeMs);
          },
          function() {
            // Older API shape used before ~2022
            var vp = window.netflix.player;
            vp.seek(timeMs);
          },
        ];

        for (var i = 0; i < apiFns.length; i++) {
          try { apiFns[i](); seeked = true; break; } catch(apiErr) {}
        }

        if (!seeked) {
          console.warn('[Syntagma] Netflix seek: no working API path found for seek to ' + timeMs + 'ms');
        }
      });

      // ── Patch window.fetch ─────────────────────────────────────────────────
      var origFetch = window.fetch;
      window.fetch = async function () {
        var args = Array.prototype.slice.call(arguments);
        var response = await origFetch.apply(this, args);
        var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        if (isSubtitleUrl(url)) {
          response.clone().text().then(function(t) { tryDispatchTTML(t, url); }).catch(function() {});
        }
        if (isManifestUrl(url)) {
          response.clone().text().then(tryProcessManifest).catch(function() {});
        }
        return response;
      };

      // ── Patch XMLHttpRequest ───────────────────────────────────────────────
      var origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function () {
        var url = arguments[1] ? arguments[1].toString() : '';
        this.addEventListener('load', function () {
          if (isSubtitleUrl(url)) {
            try { tryDispatchTTML(this.responseText, url); } catch (e) {}
          }
          if (isManifestUrl(url)) {
            try { tryProcessManifest(this.responseText); } catch (e) {}
          }
        });
        origOpen.apply(this, arguments);
      };
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
}

// Netflix TTML parser
function parseNetflixTTML(xml: string): SubtitleCue[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const cues: SubtitleCue[] = [];
    doc.querySelectorAll('p[begin][end]').forEach(p => {
      // TTML uses "begin" and "end" in format "12345678t" or strict HH:MM:SS.mmm
      // Netflix usually supplies native ticks (e.g. 1234t) where 1t = 1/10000000s or standard ms.
      // Often TTML ticks depend on tickRate in <tt> header. Let's handle 't' suffix.
      let startMs = 0;
      let endMs = 0;
      
      const parseTime = (str: string) => {
        if (str.endsWith('t')) {
          const tickRateStr = doc.documentElement.getAttribute('ttp:tickRate');
          const tickRate = tickRateStr ? parseInt(tickRateStr, 10) : 10000000;
          return Math.round((parseInt(str, 10) / tickRate) * 1000);
        } else if (str.includes(':')) {
           // HH:MM:SS.mmm
           const parts = str.split(':');
           if (parts.length === 3) {
             const h = parseFloat(parts[0]);
             const m = parseFloat(parts[1]);
             const s = parseFloat(parts[2]);
             return Math.round((h * 3600 + m * 60 + s) * 1000);
           }
        } else if (str.endsWith('ms')) {
           return parseInt(str, 10);
        }
        return 0;
      };

      startMs = parseTime(p.getAttribute('begin') || '');
      endMs = parseTime(p.getAttribute('end') || '');

      let text = p.innerHTML.replace(/<br\s*[\/]?>/gi, '\n');
      text = text.replace(/<[^>]+>/g, '');
      const unescapeEl = document.createElement('textarea');
      unescapeEl.innerHTML = text;
      text = unescapeEl.value.trim();

      if (text) {
        cues.push({
          index: cues.length,
          startMs, endMs,
          text, rawText: text,
          bookmarked: false, selected: false,
        });
      }
    });

    return cues;
  } catch (err) {
    console.error('[Syntagma] TTML parse error:', err);
    return [];
  }
}

export function observeNetflixCaptions(
  video: HTMLVideoElement,
  onCueAppear: (text: string) => void,
  onCueDisappear: () => void,
  onAllCuesReady?: (cues: SubtitleCue[]) => void,
): () => void {
  injectNetflixInterceptor();

  let stopFn: (() => void) | null = null;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // netflixCues holds the best transcript we've assembled so far.
  // It grows monotonically — chunks from the manifest are merged in, never discarded.
  let netflixCues: SubtitleCue[] = [];

  // ── Helper: merge new cues into the accumulator ─────────────────────────
  // Deduplicates by startMs so overlapping chunks don't create duplicate lines.
  function mergeCues(incoming: SubtitleCue[]): SubtitleCue[] {
    const seen = new Set(netflixCues.map(c => c.startMs));
    const novel = incoming.filter(c => !seen.has(c.startMs));
    if (novel.length === 0) return netflixCues;
    const combined = [...netflixCues, ...novel];
    combined.sort((a, b) => a.startMs - b.startMs);
    combined.forEach((c, i) => { c.index = i; });
    trimOverlaps(combined);
    return combined;
  }

  // ── Path A: manifest-based full transcript (pre-parsed, atomic) ──────────
  // The injected script fetches ALL subtitle chunks in parallel and dispatches
  // this event once with every cue.  This is the preferred path — no scrubbing.
  const handleParsedCues = (e: Event) => {
    const raw = (e as CustomEvent<{ cues: Array<{ startMs: number; endMs: number; text: string }> }>).detail.cues;
    if (!raw?.length) return;

    const incoming: SubtitleCue[] = raw.map((c, i) => ({
      index: i,
      startMs: c.startMs,
      endMs:   c.endMs,
      text:    c.text,
      rawText: c.text,
      bookmarked: false,
      selected: false,
    }));

    netflixCues = mergeCues(incoming);
    onAllCuesReady?.(netflixCues);
    console.log('[Syntagma] Full transcript from manifest: ' + netflixCues.length + ' cues.');
  };
  window.addEventListener('syntagma:netflix-cues', handleParsedCues);

  // ── Read DOM cache: handle race where manifest fired before this listener ──
  // The page-injected script may have dispatched syntagma:netflix-cues before
  // this content-script listener was attached (race during initial page load).
  // The injected script caches the cues in a DOM element so we can recover here.
  const cacheEl = document.getElementById('syntagma-netflix-cues-cache');
  const cachedJson = cacheEl?.getAttribute('data-cues');
  if (cachedJson) {
    try {
      const raw = JSON.parse(cachedJson) as Array<{ startMs: number; endMs: number; text: string }>;
      if (raw?.length > 0) {
        const incoming: SubtitleCue[] = raw.map((c, i) => ({
          index: i,
          startMs: c.startMs,
          endMs: c.endMs,
          text: c.text,
          rawText: c.text,
          bookmarked: false,
          selected: false,
        }));
        netflixCues = mergeCues(incoming);
        onAllCuesReady?.(netflixCues);
        console.log('[Syntagma] Recovered ' + netflixCues.length + ' cues from DOM cache.');
      }
    } catch { /* malformed cache — ignore */ }
  }

  // ── Path B: individual TTML chunk intercepted during playback ────────────
  // Fired for each nflxvideo.net subtitle file the player fetches naturally.
  // Chunks are merged so the transcript grows without losing earlier data.
  const handleIntercept = (e: Event) => {
    const { xml } = (e as CustomEvent).detail;
    const incoming = parseNetflixTTML(xml);
    if (incoming.length === 0) return;

    netflixCues = mergeCues(incoming);
    onAllCuesReady?.(netflixCues);
    console.log('[Syntagma] Merged subtitle chunk: ' + netflixCues.length + ' cues total.');
  };
  window.addEventListener('syntagma:netflix-transcript', handleIntercept);

  // ── Path D: on-demand fetch from player state ─────────────────────────────
  // Triggered after 1.5 s if no cues arrived via interception, and also by the
  // sidebar Retry button. The injected page script searches Netflix's internal
  // player state for timedtextTracks URLs and re-runs fetchAllSubtitlesFromManifest.
  let onDemandTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    onDemandTimer = null;
    if (netflixCues.length === 0) {
      console.log('[Syntagma] No cues yet — triggering on-demand player-state fetch...');
      window.dispatchEvent(new CustomEvent('syntagma:request-subtitles'));
    }
  }, 1500);

  window.addEventListener('syntagma:request-subtitles', () => {
    // Content script side is just a relay — the injected page script does the work.
    // Re-dispatching here allows the sidebar Retry button to also trigger it.
  });

  // ── Path C: live DOM / TextTrack observer (progressive, real-time) ───────
  // Only used for live caption display (onCueAppear/Disappear) and as a last-
  // resort transcript builder when the manifest path fails.
  const safeOnAllCuesReady = (cues: SubtitleCue[]) => {
    // If manifest/chunk interception already gave us a richer transcript, skip.
    if (netflixCues.length >= cues.length) return;
    onAllCuesReady?.(cues);
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
    if (timer) clearTimeout(timer);
    if (onDemandTimer) clearTimeout(onDemandTimer);
    stopFn?.();
    video.textTracks.removeEventListener('addtrack', onAddTrack);
    window.removeEventListener('syntagma:netflix-transcript', handleIntercept);
    window.removeEventListener('syntagma:netflix-cues', handleParsedCues);
  };
}
