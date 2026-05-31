const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const babel = require('@babel/core');
const transformModulesCommonJS = require('@babel/plugin-transform-modules-commonjs');
const originalJsLoader = require.extensions['.js'];

require.extensions['.js'] = (module, filename) => {
  if (!filename.includes(`${process.cwd()}\\src\\`) && !filename.includes(`${process.cwd()}/src/`)) {
    return originalJsLoader(module, filename);
  }

  const source = fs.readFileSync(filename, 'utf8');
  const { code } = babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [transformModulesCommonJS],
  });
  module._compile(code, filename);
};

const {
  applyOfflineCollectionCounts,
  applyLocalReviewableCountOverlay,
  buildCollectionMap,
  buildVocabularyItems,
  cacheCollectionReviewableIdsKey,
  extractFlashcardIds,
  filterReviewableCards,
  getCardCollectionIds,
  mapFlashcardsToCards,
  paginateVocabularyItems,
  removeReviewableId,
  updateVocabularyStatus,
} = require('./offline-cache.js');

const flashcards = [
  {
    flashcardId: 1,
    lemma: 'Apple',
    translation: 'elma',
    sourceSentence: 'I ate an apple.',
    collectionId: 10,
    collectionIds: [20],
    knowledgeStatus: 'LEARNING',
    createdAt: '2026-05-01T10:00:00',
    updatedAt: '2026-05-02T10:00:00',
  },
  {
    flashcardId: 2,
    lemma: 'Bread',
    translation: 'ekmek',
    collectionIds: [10],
    knowledgeStatus: 'KNOWN',
  },
  {
    flashcardId: 3,
    lemma: 'Cloud',
    translation: 'bulut',
    collectionIds: [20],
    knowledgeStatus: 'UNKNOWN',
  },
];

test('maps every cached flashcard without dropping collection or review fields', () => {
  const mapped = mapFlashcardsToCards(flashcards);

  assert.equal(mapped.length, 3);
  assert.deepEqual(mapped[0], {
    id: 1,
    flashcardId: 1,
    collectionId: 10,
    collectionIds: [20],
    knowledgeStatus: 'LEARNING',
    word: 'Apple',
    lemma: 'Apple',
    phonetic: '',
    sentence: 'I ate an apple.',
    exampleSentence: '',
    sourceSentence: 'I ate an apple.',
    translation: 'elma',
    usageNote: '',
    sentenceTranslation: '',
    sourceTitle: '',
    sourceUrl: '',
    videoTimestamp: null,
    audioUrl: '',
    sentenceAudioDataUrl: '',
    englishPronunciationUri: '',
    turkishPronunciationUri: '',
    imageUri: '',
    imageUrl: '',
    screenshotDataUrl: '',
    createdAt: '2026-05-01T10:00:00',
    updatedAt: '2026-05-02T10:00:00',
  });
});

test('builds collection buckets from legacy collectionId and new collectionIds', () => {
  const collections = [{ collectionId: 10 }, { collectionId: 20 }, { collectionId: 30 }];
  const map = buildCollectionMap(flashcards, collections);

  assert.deepEqual([...map.keys()], [10, 20, 30]);
  assert.deepEqual(map.get(10).map((card) => card.flashcardId), [1, 2]);
  assert.deepEqual(map.get(20).map((card) => card.flashcardId), [1, 3]);
  assert.deepEqual(map.get(30), []);
  assert.deepEqual(getCardCollectionIds(flashcards[0]), [20, 10]);
});

test('filters reviewable cards using cached due ids and reviewed ids', () => {
  const cards = mapFlashcardsToCards(flashcards);
  const reviewableIds = [1, 3];

  assert.deepEqual(
    filterReviewableCards(cards, reviewableIds, ['1']).map((card) => card.flashcardId),
    [3]
  );
});

test('removing a reviewed id drops offline collection due count', () => {
  const cardsByCollection = {
    10: mapFlashcardsToCards([flashcards[0], flashcards[1]]),
  };
  const reviewableByCollection = {
    10: removeReviewableId([1, 2], 1),
  };

  const counts = applyOfflineCollectionCounts(
    [{ collectionId: 10, name: 'Deck A', reviewableCount: 2 }],
    cardsByCollection,
    reviewableByCollection,
    []
  );

  assert.equal(counts[0].reviewableCount, 1);
});

test('missing reviewable-id cache returns no due cards', () => {
  const cards = mapFlashcardsToCards(flashcards);

  assert.deepEqual(
    filterReviewableCards(cards, null, ['2']).map((card) => card.flashcardId),
    []
  );
});

test('derives offline collection counts from saved cards and due ids', () => {
  const cardsByCollection = {
    10: mapFlashcardsToCards([flashcards[0], flashcards[1]]),
    20: mapFlashcardsToCards([flashcards[0], flashcards[2]]),
  };
  const reviewableByCollection = {
    10: [1],
    20: [1, 3],
  };

  const counts = applyOfflineCollectionCounts(
    [
      { collectionId: 10, name: 'Deck A', reviewableCount: 0 },
      { collectionId: 20, name: 'Deck B', reviewableCount: 0 },
    ],
    cardsByCollection,
    reviewableByCollection,
    ['1']
  );

  assert.deepEqual(
    counts.map((collection) => ({
      id: collection.collectionId,
      itemsCount: collection.itemsCount,
      reviewableCount: collection.reviewableCount,
    })),
    [
      { id: 10, itemsCount: 2, reviewableCount: 0 },
      { id: 20, itemsCount: 2, reviewableCount: 1 },
    ]
  );
});

test('overlays stale online due count with lower local due count', () => {
  const cardsByCollection = {
    10: mapFlashcardsToCards([flashcards[0], flashcards[1]]),
  };
  const reviewableByCollection = {
    10: [],
  };

  const counts = applyLocalReviewableCountOverlay(
    [{ collectionId: 10, name: 'Deck A', reviewableCount: 2 }],
    cardsByCollection,
    reviewableByCollection,
    ['1', '2']
  );

  assert.equal(counts[0].reviewableCount, 0);
});

test('builds vocabulary from word knowledge first, then flashcards', () => {
  const vocabulary = buildVocabularyItems(flashcards, [
    { lemma: 'Apple', status: 'KNOWN', updatedAt: '2026-05-03T10:00:00' },
    { lemma: 'Ignored', status: 'IGNORED', updatedAt: '2026-05-04T10:00:00' },
    { lemma: 'Hidden', status: 'UNKNOWN' },
  ]);

  assert.deepEqual(
    vocabulary.map((item) => [item.lemmaKey, item.status]),
    [
      ['apple', 'KNOWN'],
      ['bread', 'KNOWN'],
      ['cloud', 'LEARNING'],
      ['ignored', 'IGNORED'],
    ]
  );
});

test('paginates cached vocabulary with local search and status filters', () => {
  const vocabulary = buildVocabularyItems(flashcards, [
    { lemma: 'Apricot', status: 'LEARNING' },
    { lemma: 'Ignored', status: 'IGNORED' },
  ]);

  assert.deepEqual(
    paginateVocabularyItems(vocabulary, 0, 2, 'LEARNING', 'apr'),
    {
      content: [
        { lemma: 'Apricot', lemmaKey: 'apricot', status: 'LEARNING', updatedAt: null },
      ],
      last: true,
      totalElements: 1,
    }
  );
});

test('paginates full cached vocabulary with total count', () => {
  const vocabulary = Array.from({ length: 125 }, (_, index) => ({
    lemma: `Word ${String(index).padStart(3, '0')}`,
    lemmaKey: `word-${String(index).padStart(3, '0')}`,
    status: 'LEARNING',
    updatedAt: null,
  }));

  const page = paginateVocabularyItems(vocabulary, 2, 50, 'ALL', '');

  assert.equal(page.content.length, 25);
  assert.equal(page.last, true);
  assert.equal(page.totalElements, 125);
});

test('updates offline vocabulary status persistently by lemma key', () => {
  const vocabulary = buildVocabularyItems(flashcards, []);
  const updated = updateVocabularyStatus(vocabulary, 'cloud', 'KNOWN');
  const cloud = updated.find((item) => item.lemmaKey === 'cloud');

  assert.equal(cloud.status, 'KNOWN');
  assert.match(cloud.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('extracts reviewable ids from reviewable-card payload', () => {
  const ids = extractFlashcardIds([
    { flashcardId: 5 },
    { id: 7 },
    { flashcardId: 5 },
    null,
  ]);

  assert.deepEqual(ids, [5, 7]);
});

test('builds collection reviewable-id cache key', () => {
  assert.equal(
    cacheCollectionReviewableIdsKey(42),
    'syntagma.cache.collection.42.reviewableIds.v1'
  );
});
