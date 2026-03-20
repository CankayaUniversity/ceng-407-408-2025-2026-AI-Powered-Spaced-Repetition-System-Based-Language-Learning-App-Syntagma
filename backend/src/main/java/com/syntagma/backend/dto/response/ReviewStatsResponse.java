package com.syntagma.backend.dto.response;

import java.util.List;

public record ReviewStatsResponse(
        long totalReviews,
        Integer streakCount,
        double averageResult,
        List<DailyReviewCount> reviewsByDay
) {
    public record DailyReviewCount(
            String date,
            long count
    ) {}
}
