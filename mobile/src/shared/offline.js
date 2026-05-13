import { submitReview, updateWordKnowledge } from './api';
import {
  appendToQueue,
  getQueue,
  shiftQueue,
  getReviewDelta,
  incrementReviewDelta,
  getReviewedIds,
  addReviewedId,
} from './storage';

const QUEUE_REVIEWS = 'syntagma.queue.reviews';
const QUEUE_WORDKNOWLEDGE = 'syntagma.queue.wordknowledge';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function enqueueReview(review, lemma) {
  await appendToQueue(QUEUE_REVIEWS, { review, lemma, enqueuedAt: new Date().toISOString() });
}

export async function enqueueWordKnowledge(lemma, status) {
  await appendToQueue(QUEUE_WORDKNOWLEDGE, { lemma, status, enqueuedAt: new Date().toISOString() });
}

export async function flushQueues() {
  const reviewQueue = await getQueue(QUEUE_REVIEWS);
  for (const item of reviewQueue) {
    try {
      const response = await submitReview(item.review);
      await shiftQueue(QUEUE_REVIEWS);
      if ((response?.updatedSrsState?.scheduledDays ?? 0) >= 25 && item.lemma) {
        await updateWordKnowledge(item.lemma, 'KNOWN').catch(() =>
          enqueueWordKnowledge(item.lemma, 'KNOWN').catch(() => {})
        );
      }
    } catch {
      break;
    }
  }

  const wkQueue = await getQueue(QUEUE_WORDKNOWLEDGE);
  for (const item of wkQueue) {
    try {
      await updateWordKnowledge(item.lemma, item.status);
      await shiftQueue(QUEUE_WORDKNOWLEDGE);
    } catch {
      break;
    }
  }
}

export async function getReviewDeltaToday() {
  return getReviewDelta(todayStr());
}

export async function bumpDelta() {
  await incrementReviewDelta(todayStr());
}

export async function getReviewedIdsToday() {
  return getReviewedIds(todayStr());
}

export async function markCardReviewed(cardId) {
  await addReviewedId(todayStr(), cardId);
}
