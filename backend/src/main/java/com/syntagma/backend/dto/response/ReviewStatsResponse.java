package com.syntagma.backend.dto.response;

import java.util.List;

public record ReviewStatsResponse(
        long totalReviews,
        long weeklyCount,
        long monthlyCount,
        long yearlyCount,
        Integer streakCount,
        Integer longestStreakCount,
        double averageResult,
        List<DailyReviewCount> reviewsByDay
) {
    public record DailyReviewCount(
            String date,
            long count
    ) {}
}
