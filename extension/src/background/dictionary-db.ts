export const DB_NAME = 'SyntagmaDictionaryDB';
export const DB_VERSION = 1;
export const STORE_NAME = 'translations';

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDictionaryDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('word_idx', 'word', { unique: false });
      }
    };
  });

  return dbPromise;
}

const DICT_LOADED_KEY = 'dictIndexed';

export async function isDictionaryLoaded(): Promise<boolean> {
  // Fast path: O(1) chrome.storage check instead of counting 1.46M IDB rows.
  try {
    const result = await chrome.storage.local.get(DICT_LOADED_KEY);
    if (result[DICT_LOADED_KEY] === true) return true;
  } catch { /* fall through to IDB count */ }

  const db = await getDictionaryDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const countReq = store.count();
    countReq.onsuccess = () => resolve(countReq.result > 1460000);
    countReq.onerror = () => resolve(false);
  });
}

export async function populateDictionary(): Promise<void> {
  const loaded = await isDictionaryLoaded();
  if (loaded) {
    console.log('[Syntagma] Dictionary is fully indexed.');
    return;
  }

  console.log('[Syntagma] Began indexing dictionary.json (This may take up to 20 seconds)...');
  try {
    const url = chrome.runtime.getURL('dictionary.json');
    const res = await fetch(url);
    const data = await res.json();
    
    const db = await getDictionaryDB();
    
    // Clear the store first to prevent duplicate entries from a broken/aborted prior run
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const clearReq = store.clear();
      clearReq.onsuccess = () => resolve();
      clearReq.onerror = () => reject(clearReq.error);
    });

    const CHUNK_SIZE = 150000;
    console.log(`[Syntagma] Parsed ${data.length} dict entries. Inserting in huge chunks of ${CHUNK_SIZE}...`);

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        for (const item of chunk) {
          if (!item.word || !item.tr) continue;
          store.put({
            word: item.word.toLowerCase().trim(),
            tr: item.tr.trim()
          });
        }
      });
      console.log(`[Syntagma] Indexed ${Math.min(i + CHUNK_SIZE, data.length)} / ${data.length}...`);
      // Keep service worker alive
      await new Promise(r => setTimeout(r, 0)); 
    }
    console.log('[Syntagma] Dictionary completely indexed!');
    // Cache the loaded flag so future SW wakeups skip the expensive IDB count.
    await chrome.storage.local.set({ [DICT_LOADED_KEY]: true });
  } catch (err) {
    console.error('[Syntagma] Dictionary population failed:', err);
  }
}

export async function lookupTranslation(searchWord: string): Promise<string[]> {
  const db = await getDictionaryDB();
  const lowerWord = searchWord.toLowerCase().trim();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('word_idx');
    const request = index.getAll(lowerWord);

    request.onsuccess = () => {
      const results = request.result || [];
      const uniqueTrs = Array.from(new Set(results.map((r: any) => r.tr)));
      resolve(uniqueTrs.slice(0, 3) as string[]);
    };
    request.onerror = () => reject(request.error);
  });
}
