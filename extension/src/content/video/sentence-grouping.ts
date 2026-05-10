import type { SubtitleCue } from '../../shared/types';

export interface SentenceGroup {
  key: string;
  text: string;
  startMs: number;
  endMs: number;
  firstCueIndex: number;
  cueIndices: number[];
}

const CONTINUATION_GAP_MS = 200;
const MAX_WORDS = 28;

function wordCount(s: string): number {
  return (s.match(/\b\w+\b/g) ?? []).length;
}

function splitByTerminator(text: string): Array<{ text: string; terminated: boolean }> {
  const out: Array<{ text: string; terminated: boolean }> = [];
  const re = /[.!?]+["')\]]?(?=\s|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    const piece = text.slice(last, end).trim();
    if (piece) out.push({ text: piece, terminated: true });
    last = end;
  }
  const tail = text.slice(last).trim();
  if (tail) out.push({ text: tail, terminated: false });
  return out;
}

function stripAnnotations(t: string): string {
  return t
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/>>+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSentences(cues: SubtitleCue[]): SentenceGroup[] {
  const out: SentenceGroup[] = [];
  let buf: string[] = [];
  let idxs: number[] = [];
  let startMs = 0;
  let firstCueIndex = 0;
  let endMs = 0;

  const flush = () => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      out.push({
        key: `${firstCueIndex}-${out.length}`,
        text,
        startMs,
        endMs,
        firstCueIndex,
        cueIndices: idxs.slice(),
      });
    }
    buf = [];
    idxs = [];
  };

  for (const cue of cues) {
    const t = stripAnnotations(cue.text);
    if (!t) {
      flush();
      continue;
    }

    if (buf.length > 0) {
      const lastBuf = buf[buf.length - 1];
      const continues =
        !/[.!?][")\]]?$/.test(lastBuf) &&
        cue.startMs - endMs <= CONTINUATION_GAP_MS;
      if (!continues) flush();
    }

    const parts = splitByTerminator(t);
    for (const part of parts) {
      if (buf.length === 0) {
        startMs = cue.startMs;
        firstCueIndex = cue.index;
      }
      buf.push(part.text);
      if (idxs[idxs.length - 1] !== cue.index) idxs.push(cue.index);
      endMs = cue.endMs;

      if (part.terminated) {
        flush();
      } else if (wordCount(buf.join(' ')) >= MAX_WORDS) {
        flush();
      }
    }
  }
  flush();

  return out;
}

/** Find the sentence that contains the given cue index. */
export function findSentenceByCueIndex(sentences: SentenceGroup[], cueIndex: number): SentenceGroup | null {
  return sentences.find(s => s.cueIndices.includes(cueIndex)) ?? null;
}
