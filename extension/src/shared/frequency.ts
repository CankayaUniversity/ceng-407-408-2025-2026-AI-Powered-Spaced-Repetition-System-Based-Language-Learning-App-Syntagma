import type { FrequencyBand } from './types';

interface FreqEntry {
  rank: number;
  zipf: number;
}

let freqTable: Record<string, FreqEntry> | null = null;

async function loadFreqTable(): Promise<Record<string, FreqEntry>> {
  if (freqTable) return freqTable;
  try {
    const url = chrome.runtime.getURL('assets/freq-en.json');
    const res = await fetch(url);
    freqTable = await res.json() as Record<string, FreqEntry>;
  } catch {
    freqTable = {};
  }
  return freqTable;
}

// Synchronous lookup after table is loaded
const syncTable: Record<string, FreqEntry> = {};
let tableLoaded = false;

export async function initFrequencyTable(): Promise<void> {
  const table = await loadFreqTable();
  Object.assign(syncTable, table);
  tableLoaded = true;
}

export function lookupFrequency(lemma: string): FreqEntry | null {
  const entry = syncTable[lemma.toLowerCase()];
  return entry ?? null;
}

export function isTableLoaded(): boolean {
  return tableLoaded;
}

export function getFrequencyBand(rank: number): FrequencyBand {
  if (rank <= 1000) return 'very-common';
  if (rank <= 5000) return 'common';
  if (rank <= 20000) return 'medium';
  return 'rare';
}

export function isEnglishWord(lemma: string): boolean {
  if (!tableLoaded) return true; // default allow when not loaded
  return lemma.toLowerCase() in syncTable;
}
