import type { SubtitleCue } from '../../shared/types';
import { parseVTT } from './subtitle-parser';

export const NETFLIX_WEBVTT_PROFILE = 'webvtt-lssdh-ios8';

export interface NetflixTimedTextTrack {
  language?: string;
  bcp47?: string;
  rawTrackType?: string;
  isNoneTrack?: boolean;
  isForcedNarrative?: boolean;
  ttDownloadables?: Record<string, NetflixDownloadable>;
}

export interface NetflixDownloadable {
  downloadUrls?: Record<string, unknown> | unknown[];
  urls?: Record<string, unknown> | unknown[];
}

export interface NetflixSubtitleDownload {
  url: string;
  language: string;
  format: string;
  trackType: string;
}

export interface FetchNetflixSubtitlesOptions {
  preferredLang?: string;
  fetchFn?: typeof fetch;
  debug?: boolean;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null;
}

function getTrackArray(value: UnknownRecord | null): NetflixTimedTextTrack[] {
  const tracks = value?.timedtexttracks ?? value?.timedtextTracks;
  return Array.isArray(tracks) ? tracks as NetflixTimedTextTrack[] : [];
}

export function extractNetflixTimedTextTracks(payload: unknown): NetflixTimedTextTrack[] {
  const root = asRecord(payload);
  const direct = getTrackArray(root);
  if (direct.length > 0) return direct;

  const result = asRecord(root?.result);
  return getTrackArray(result);
}

function trackLanguage(track: NetflixTimedTextTrack): string {
  return (track.language || track.bcp47 || '').toLowerCase();
}

function languageMatches(track: NetflixTimedTextTrack, preferredLang: string): boolean {
  const language = trackLanguage(track);
  const preferred = preferredLang.toLowerCase();
  return language === preferred || language.startsWith(`${preferred}-`) || preferred.startsWith(`${language}-`);
}

function trackScore(track: NetflixTimedTextTrack, preferredLang: string): number {
  const type = (track.rawTrackType || '').toLowerCase();
  let score = languageMatches(track, preferredLang) ? 0 : 100;

  if (type === 'subtitles') score += 0;
  else if (type === 'closedcaptions' || type === 'captions') score += 10;
  else score += 20;

  if (track.isForcedNarrative) score += 30;
  return score;
}

export function selectNetflixSubtitleTracks(
  payload: unknown,
  preferredLang = 'en',
): NetflixTimedTextTrack[] {
  const tracks = extractNetflixTimedTextTracks(payload)
    .filter(track => !track.isNoneTrack && track.ttDownloadables);

  if (tracks.length === 0) return [];

  const languageMatchesPreferred = tracks.some(track => languageMatches(track, preferredLang));
  return [...tracks]
    .filter(track => !languageMatchesPreferred || languageMatches(track, preferredLang))
    .sort((a, b) => trackScore(a, preferredLang) - trackScore(b, preferredLang));
}

function collectUrlStrings(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectUrlStrings);
  }

  const record = asRecord(value);
  if (!record) return [];

  if (typeof record.url === 'string') {
    return collectUrlStrings(record.url);
  }

  return Object.values(record).flatMap(collectUrlStrings);
}

function downloadableUrls(downloadable: NetflixDownloadable | undefined): string[] {
  if (!downloadable) return [];
  return [
    ...collectUrlStrings(downloadable.downloadUrls),
    ...collectUrlStrings(downloadable.urls),
  ];
}

export function extractNetflixSubtitleDownloads(
  payload: unknown,
  preferredLang = 'en',
): NetflixSubtitleDownload[] {
  const [track] = selectNetflixSubtitleTracks(payload, preferredLang);
  if (!track?.ttDownloadables) return [];

  const formats = Object.keys(track.ttDownloadables);
  const orderedFormats = [
    NETFLIX_WEBVTT_PROFILE,
    'simplesdh',
    'nflx-cmisc',
    'imsc1.1',
    ...formats.filter(format => ![
      NETFLIX_WEBVTT_PROFILE,
      'simplesdh',
      'nflx-cmisc',
      'imsc1.1',
    ].includes(format)),
  ];

  for (const format of orderedFormats) {
    const urls = [...new Set(downloadableUrls(track.ttDownloadables[format]))];
    if (urls.length === 0) continue;

    return urls.map(url => ({
      url,
      language: track.language || track.bcp47 || preferredLang,
      format,
      trackType: track.rawTrackType || 'subtitles',
    }));
  }

  return [];
}

function parseNetflixTime(raw: string, tickRate: number): number {
  const value = raw.trim();
  if (!value) return 0;

  if (value.endsWith('t')) {
    return Math.round((Number.parseInt(value, 10) / tickRate) * 1000);
  }

  if (value.endsWith('ms')) {
    return Number.parseFloat(value);
  }

  if (value.endsWith('s')) {
    return Math.round(Number.parseFloat(value) * 1000);
  }

  const normalized = value.replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length === 3) {
    return Math.round(
      (Number.parseFloat(parts[0]) * 3600 +
        Number.parseFloat(parts[1]) * 60 +
        Number.parseFloat(parts[2])) * 1000,
    );
  }

  return 0;
}

function textFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as Element;
  if (element.localName.toLowerCase() === 'br') return '\n';
  return Array.from(element.childNodes).map(textFromNode).join('');
}

function normalizeSubtitleText(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function parseNetflixTTML(xml: string): SubtitleCue[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) return [];

  const tickRateAttr =
    doc.documentElement.getAttribute('ttp:tickRate') ??
    doc.documentElement.getAttribute('tickRate') ??
    xml.match(/(?:ttp:)?tickRate=["'](\d+)["']/)?.[1];
  const tickRate = tickRateAttr ? Number.parseInt(tickRateAttr, 10) : 10000000;

  const cues: SubtitleCue[] = [];
  doc.querySelectorAll('p[begin]').forEach((p) => {
    const startMs = parseNetflixTime(p.getAttribute('begin') ?? '', tickRate);
    const endValue = p.getAttribute('end');
    const durValue = p.getAttribute('dur');
    const endMs = endValue
      ? parseNetflixTime(endValue, tickRate)
      : startMs + parseNetflixTime(durValue ?? '', tickRate);
    const text = normalizeSubtitleText(textFromNode(p));

    if (!text || endMs <= startMs) return;
    cues.push({
      index: cues.length,
      startMs,
      endMs,
      text,
      rawText: text,
      bookmarked: false,
      selected: false,
    });
  });

  return cues;
}

export function parseNetflixSubtitleContent(content: string, format = ''): SubtitleCue[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const lowerFormat = format.toLowerCase();
  if (trimmed.includes('WEBVTT') || lowerFormat.includes('vtt')) {
    return normalizeNetflixCues(parseVTT(trimmed));
  }

  if (trimmed.includes('<tt') || trimmed.includes('<p')) {
    return normalizeNetflixCues(parseNetflixTTML(trimmed));
  }

  return [];
}

export function normalizeNetflixCues(cues: SubtitleCue[]): SubtitleCue[] {
  const seen = new Set<string>();
  const sorted = cues
    .filter(cue => cue.text.trim() && cue.endMs > cue.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const unique = sorted.filter((cue) => {
    const key = `${cue.startMs}:${cue.endMs}:${cue.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (let i = 0; i < unique.length - 1; i++) {
    if (unique[i].endMs > unique[i + 1].startMs) {
      unique[i] = { ...unique[i], endMs: unique[i + 1].startMs };
    }
  }

  return unique.map((cue, index) => ({ ...cue, index }));
}

export async function fetchNetflixSubtitlesFromManifest(
  payload: unknown,
  options: FetchNetflixSubtitlesOptions = {},
): Promise<SubtitleCue[]> {
  const preferredLang = options.preferredLang ?? 'en';
  const fetchFn = options.fetchFn ?? fetch;
  const downloads = extractNetflixSubtitleDownloads(payload, preferredLang);
  if (downloads.length === 0) {
    if (options.debug) {
      console.info('[Syntagma] Netflix subtitles: manifest had no downloadable subtitle URLs.');
    }
    return [];
  }

  if (options.debug) {
    console.info(
      `[Syntagma] Netflix subtitles: fetching ${downloads.length} ${downloads[0].format} subtitle URL(s).`,
    );
  }

  const cueGroups = await Promise.all(
    downloads.map(async (download) => {
      try {
        // Netflix subtitle URLs are signed CDN URLs. Sending credentials triggers
        // CORS rejection because the CDN responds with Access-Control-Allow-Origin: *.
        const response = await fetchFn(download.url, { credentials: 'omit' });
        if (!response.ok) {
          if (options.debug) {
            console.info(
              `[Syntagma] Netflix subtitles: ${download.format} fetch returned HTTP ${response.status}.`,
            );
          }
          return [];
        }
        const text = await response.text();
        const cues = parseNetflixSubtitleContent(text, download.format);
        if (options.debug) {
          console.info(
            `[Syntagma] Netflix subtitles: parsed ${cues.length} cue(s) from ${download.format}.`,
          );
        }
        return cues;
      } catch (err) {
        if (options.debug) {
          console.info('[Syntagma] Netflix subtitles: subtitle URL fetch failed.', err);
        }
        return [];
      }
    }),
  );

  const cues = normalizeNetflixCues(cueGroups.flat());
  if (options.debug) {
    console.info(`[Syntagma] Netflix subtitles: ${cues.length} cue(s) after merge.`);
  }
  return cues;
}
