package com.syntagma.backend.service;

import com.syntagma.backend.entity.SrsState;
import com.syntagma.backend.entity.enums.CardState;
import com.syntagma.backend.entity.enums.Rating;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * Pure Java implementation of the FSRS v5 (Free Spaced Repetition Scheduler)
 * algorithm — the same algorithm used by Anki.
 *
 * <p>FSRS uses a three-component memory model:
 * <ul>
 *   <li><b>Difficulty (D)</b>: How hard the card is to memorize (1-10 scale)</li>
 *   <li><b>Stability (S)</b>: Time in days when retrievability drops to 90%</li>
 *   <li><b>Retrievability (R)</b>: Probability of successful recall at review time</li>
 * </ul>
 *
 * <p>Reference: <a href="https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm">FSRS Algorithm Wiki</a>
 */
@Service
public class FsrsAlgorithm {

    // FSRS v5 default parameters (19 weights), tuned by the FSRS team
    private static final double[] W = {
            0.4072, 1.1829, 3.1262, 15.4722,   // w0-w3:  initial stabilities for Again/Hard/Good/Easy
            7.2102,                              // w4:     difficulty mean reversion
            0.5316,                              // w5:     difficulty initial offset
            1.0651,                              // w6:     difficulty scaling
            0.0046,                              // w7:     stability after forgetting factor
            1.5071,                              // w8:     stability increase factor
            0.1367,                              // w9:     stability difficulty modifier
            1.0,                                 // w10:    stability stability modifier
            2.0473,                              // w11:    stability retrievability modifier
            0.0224,                              // w12:    stability hard penalty
            0.3025,                              // w13:    stability easy bonus
            0.0224,                              // w14:    stability hard penalty for recall
            2.9466,                              // w15:    stability easy bonus for recall
            0.2635,                              // w16:    forgetting stability factor
            2.9898,                              // w17:    forgetting difficulty factor
            0.5169                               // w18:    forgetting interval factor
    };

    // Target retention rate (90% = Anki default)
    private static final double REQUEST_RETENTION = 0.9;

    // Maximum review interval in days
    private static final int MAX_INTERVAL = 36500; // ~100 years

    // Decay and factor constants used in retrievability formula
    private static final double DECAY = -0.5;
    private static final double FACTOR = Math.pow(0.9, 1.0 / DECAY) - 1.0;

    /**
     * Process a user review on a flashcard and update the SrsState with new FSRS values.
     *
     * @param srsState The current SRS state of the card
     * @param rating   The user's rating (AGAIN, HARD, GOOD, EASY)
     * @param now      The current timestamp
     */
    public void processReview(SrsState srsState, Rating rating, LocalDateTime now) {
        CardState currentState = CardState.fromString(srsState.getState());

        // Calculate elapsed days since last review
        int elapsedDays = 0;
        if (srsState.getLastReviewedAt() != null) {
            elapsedDays = (int) Duration.between(srsState.getLastReviewedAt(), now).toDays();
        }
        srsState.setElapsedDays(elapsedDays);

        // Calculate current retrievability
        double retrievability = calculateRetrievability(srsState.getStability(), elapsedDays);
        srsState.setRetrievability((float) retrievability);

        switch (currentState) {
            case NEW -> handleNewCard(srsState, rating, now);
            case LEARNING, RELEARNING -> handleLearningCard(srsState, rating, now);
            case REVIEW -> handleReviewCard(srsState, rating, now, retrievability);
        }

        // Increment reps
        srsState.setReps(srsState.getReps() + 1);
        srsState.setLastReviewedAt(now);
    }

    // ═══════════════════════════════════════════════════════════════
    // State Handlers
    // ═══════════════════════════════════════════════════════════════

    private void handleNewCard(SrsState srsState, Rating rating, LocalDateTime now) {
        // For new cards, use initial stability from w0-w3 based on the rating
        double initStability = initStability(rating);
        double initDifficulty = initDifficulty(rating);

        srsState.setStability((float) initStability);
        srsState.setDifficulty((float) clampDifficulty(initDifficulty));

        switch (rating) {
            case AGAIN -> {
                srsState.setState(CardState.LEARNING.name());
                srsState.setScheduledDays(0);
                srsState.setNextReviewAt(now.plusMinutes(1));
                srsState.setLapses(srsState.getLapses() + 1);
            }
            case HARD -> {
                srsState.setState(CardState.LEARNING.name());
                srsState.setScheduledDays(0);
                srsState.setNextReviewAt(now.plusMinutes(5));
            }
            case GOOD -> {
                srsState.setState(CardState.LEARNING.name());
                srsState.setScheduledDays(0);
                srsState.setNextReviewAt(now.plusMinutes(10));
            }
            case EASY -> {
                int interval = nextInterval(initStability);
                srsState.setState(CardState.REVIEW.name());
                srsState.setScheduledDays(interval);
                srsState.setNextReviewAt(now.plusDays(interval));
            }
        }
    }

    private void handleLearningCard(SrsState srsState, Rating rating, LocalDateTime now) {
        double s = srsState.getStability();
        double d = srsState.getDifficulty();

        // Update difficulty
        double newD = nextDifficulty(d, rating);
        srsState.setDifficulty((float) clampDifficulty(newD));

        // For Learning/Relearning cards, short-term scheduling applies
        switch (rating) {
            case AGAIN -> {
                srsState.setState(CardState.LEARNING.name());
                srsState.setScheduledDays(0);
                srsState.setNextReviewAt(now.plusMinutes(5));
                srsState.setLapses(srsState.getLapses() + 1);
            }
            case HARD -> {
                srsState.setState(CardState.LEARNING.name());
                srsState.setScheduledDays(0);
                srsState.setNextReviewAt(now.plusMinutes(10));
            }
            case GOOD -> {
                // Graduate to Review
                double newS = nextRecallStability(d, s, 1.0, rating);
                srsState.setStability((float) newS);
                int interval = nextInterval(newS);
                srsState.setState(CardState.REVIEW.name());
                srsState.setScheduledDays(interval);
                srsState.setNextReviewAt(now.plusDays(interval));
            }
            case EASY -> {
                // Graduate to Review with a longer interval
                double newS = nextRecallStability(d, s, 1.0, rating);
                srsState.setStability((float) newS);
                int interval = nextInterval(newS);
                // Easy bonus: at least 1 day more than Good would give
                interval = Math.max(interval + 1, interval);
                srsState.setState(CardState.REVIEW.name());
                srsState.setScheduledDays(interval);
                srsState.setNextReviewAt(now.plusDays(interval));
            }
        }
    }

    private void handleReviewCard(SrsState srsState, Rating rating, LocalDateTime now, double retrievability) {
        double s = srsState.getStability();
        double d = srsState.getDifficulty();

        // Update difficulty
        double newD = nextDifficulty(d, rating);
        srsState.setDifficulty((float) clampDifficulty(newD));

        if (rating == Rating.AGAIN) {
            // Card was forgotten — enter Relearning state
            double newS = nextForgetStability(d, s, retrievability);
            srsState.setStability((float) newS);
            srsState.setState(CardState.RELEARNING.name());
            srsState.setScheduledDays(0);
            srsState.setNextReviewAt(now.plusMinutes(5));
            srsState.setLapses(srsState.getLapses() + 1);
        } else {
            // Successful recall — stay in Review state
            double newS = nextRecallStability(d, s, retrievability, rating);
            srsState.setStability((float) newS);
            int interval = nextInterval(newS);
            srsState.setState(CardState.REVIEW.name());
            srsState.setScheduledDays(interval);
            srsState.setNextReviewAt(now.plusDays(interval));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // FSRS Core Formulas
    // ═══════════════════════════════════════════════════════════════

    /**
     * Initial stability for a new card, based on the first rating.
     * S0(G) = w[G-1]  (w0 for Again, w1 for Hard, w2 for Good, w3 for Easy)
     */
    private double initStability(Rating rating) {
        return W[rating.getValue() - 1];
    }

    /**
     * Initial difficulty for a new card.
     * D0(G) = w4 - exp(w5 * (G - 1)) + 1
     */
    private double initDifficulty(Rating rating) {
        return W[4] - Math.exp(W[5] * (rating.getValue() - 1)) + 1;
    }

    /**
     * Next difficulty after a review.
     * D'(D, G) = w7 * D0(3) + (1 - w7) * (D - w6 * (G - 3))
     *
     * This applies "mean reversion" towards the difficulty of a "Good" rating.
     */
    private double nextDifficulty(double d, Rating rating) {
        double dInitGood = initDifficulty(Rating.GOOD);
        double newD = d - W[6] * (rating.getValue() - 3);
        // Mean reversion
        return W[7] * dInitGood + (1 - W[7]) * newD;
    }

    /**
     * Next stability after a successful recall.
     * S'_r(D, S, R, G) = S * (e^(w8) * (11 - D) * S^(-w9) * (e^(w10*(1-R)) - 1) * hardPenalty * easyBonus + 1)
     */
    private double nextRecallStability(double d, double s, double r, Rating rating) {
        double hardPenalty = (rating == Rating.HARD) ? W[14] : 1.0;
        double easyBonus = (rating == Rating.EASY) ? W[15] : 1.0;

        return s * (Math.exp(W[8])
                * (11.0 - d)
                * Math.pow(s, -W[9])
                * (Math.exp(W[10] * (1.0 - r)) - 1.0)
                * hardPenalty
                * easyBonus
                + 1.0);
    }

    /**
     * Next stability after forgetting (pressing Again on a Review card).
     * S'_f(D, S, R) = w11 * D^(-w12) * ((S+1)^w13 - 1) * e^(w14*(1-R))
     */
    private double nextForgetStability(double d, double s, double r) {
        return W[16]
                * Math.pow(d, -W[17])
                * (Math.pow(s + 1.0, W[18]) - 1.0)
                * Math.exp((1.0 - r));
    }

    /**
     * Calculate retrievability (probability of recall).
     * R(t, S) = (1 + FACTOR * t / S)^DECAY
     *
     * @param stability  Memory stability in days
     * @param elapsedDays Days since last review
     * @return Probability of recall (0.0 - 1.0)
     */
    private double calculateRetrievability(double stability, int elapsedDays) {
        if (stability <= 0 || elapsedDays <= 0) return 1.0;
        return Math.pow(1.0 + FACTOR * elapsedDays / stability, DECAY);
    }

    /**
     * Calculate the next review interval in days based on stability and target retention.
     * I(R, S) = S / FACTOR * (R^(1/DECAY) - 1)
     */
    private int nextInterval(double stability) {
        double interval = (stability / FACTOR) * (Math.pow(REQUEST_RETENTION, 1.0 / DECAY) - 1.0);
        return Math.min(Math.max((int) Math.round(interval), 1), MAX_INTERVAL);
    }

    /**
     * Clamp difficulty to valid range [1, 10].
     */
    private double clampDifficulty(double d) {
        return Math.min(Math.max(d, 1.0), 10.0);
    }
}
