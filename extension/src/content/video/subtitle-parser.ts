import type { SubtitleCue } from '../../shared/types';

// ─── SRT ─────────────────────────────────────────────────────────────────────

function parseSRTTimestamp(t: string): number {
  const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  const ms = m[4].padEnd(3, '0').slice(0, 3);
  return ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +ms;
}

export function parseSRT(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split('\n');
    let i = 0;
    // Skip optional numeric index line
    if (/^\d+$/.test(lines[0]?.trim() ?? '')) i = 1;

    const timeLine = lines[i] ?? '';
    const tm = timeLine.match(
      /(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)/
    );
    if (!tm) continue;

    const startMs = parseSRTTimestamp(tm[1]);
    const endMs = parseSRTTimestamp(tm[2]);
    const rawText = lines.slice(i + 1).join('\n').trim();
    const displayText = rawText.replace(/<[^>]+>/g, '').trim();
    if (!displayText) continue;

    cues.push({
      index: cues.length,
      startMs,
      endMs,
      text: displayText,
      rawText,
      bookmarked: false,
      selected: false,
    });
  }
  return cues;
}

// ─── VTT ─────────────────────────────────────────────────────────────────────

function parseVTTTimestamp(raw: string): number {
  const parts = raw.trim().split(':');
  if (parts.length === 2) {
    // mm:ss.mmm
    const [sec, frac] = parts[1].split('.');
    return (+parts[0] * 60 + +sec) * 1000 + +(frac ?? '0').padEnd(3, '0').slice(0, 3);
  }
  // hh:mm:ss.mmm
  const [sec, frac] = parts[2].split('.');
  return ((+parts[0] * 60 + +parts[1]) * 60 + +sec) * 1000 + +(frac ?? '0').padEnd(3, '0').slice(0, 3);
}

export function parseVTT(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let i = 0;

  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) i++;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip NOTE / STYLE / REGION blocks
    if (/^(NOTE|STYLE|REGION)/.test(line)) {
      i++;
      while (i < lines.length && lines[i].trim() !== '') i++;
      while (i < lines.length && lines[i].trim() === '') i++;
      continue;
    }

    // Skip optional cue identifier line (no --> on this line, but next has one)
    if (!line.includes('-->') && lines[i + 1]?.includes('-->')) i++;

    const timeLine = lines[i]?.trim() ?? '';
    const tm = timeLine.match(/^([\d:.]+)\s*-->\s*([\d:.]+)/);
    if (!tm) { i++; continue; }

    const startMs = parseVTTTimestamp(tm[1]);
    const endMs = parseVTTTimestamp(tm[2]);
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }
    while (i < lines.length && lines[i].trim() === '') i++;

    const rawText = textLines.join('\n');
    const displayText = rawText
      .replace(/<[^>]+>/g, '')   // strip WebVTT/HTML tags
      .replace(/\{[^}]+\}/g, '') // strip SSA style tags
      .trim();
    if (!displayText) continue;

    cues.push({
      index: cues.length,
      startMs,
      endMs,
      text: displayText,
      rawText,
      bookmarked: false,
      selected: false,
    });
  }
  return cues;
}

// ─── Auto-detect ─────────────────────────────────────────────────────────────

export function parseSubtitleFile(text: string, fileName: string): SubtitleCue[] {
  if (fileName.toLowerCase().endsWith('.vtt')) return parseVTT(text);
  return parseSRT(text);
}
