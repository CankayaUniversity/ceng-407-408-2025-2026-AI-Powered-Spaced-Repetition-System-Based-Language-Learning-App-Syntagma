import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteLexeme } from './storage';
import type { LexemeEntry } from './types';

type StorageMap = Record<string, unknown>;

function createLexeme(lemma: string): LexemeEntry {
  const now = Date.now();
  return {
    key: lemma,
    lemma,
    surface: lemma,
    type: 'word',
    status: 'known',
    seenCount: 1,
    lastSeenAt: now,
    createdAt: now,
  };
}

describe('storage.deleteLexeme', () => {
  let store: StorageMap;

  beforeEach(() => {
    store = {
      userSettings: { authUserId: 'user-1' },
      'lexemes_user-1': {
        hello: createLexeme('hello'),
        world: createLexeme('world'),
      },
    };

    const local = {
      get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
        if (typeof keys === 'string') {
          return { [keys]: store[keys] };
        }
        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map(key => [key, store[key]]));
        }
        if (!keys) {
          return { ...store };
        }
        return Object.fromEntries(Object.keys(keys).map(key => [key, store[key] ?? keys[key]]));
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items);
      }),
    };

    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: { local },
    };
  });

  it('removes only the requested lemma from the scoped lexeme map', async () => {
    await deleteLexeme('hello');

    const scoped = store['lexemes_user-1'] as Record<string, LexemeEntry>;
    expect(scoped.hello).toBeUndefined();
    expect(scoped.world?.lemma).toBe('world');
  });
});
