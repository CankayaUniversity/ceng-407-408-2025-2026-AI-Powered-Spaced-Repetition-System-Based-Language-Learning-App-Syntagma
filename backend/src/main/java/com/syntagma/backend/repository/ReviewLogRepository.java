package com.syntagma.backend.repository;

import com.syntagma.backend.entity.ReviewLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;

public interface ReviewLogRepository extends JpaRepository<ReviewLog, Long> {

    Page<ReviewLog> findByUser_UserId(Long userId, Pageable pageable);

    Page<ReviewLog> findByUser_UserIdAndFlashcard_FlashcardId(Long userId, Long flashcardId, Pageable pageable);

    @Query("SELECT r FROM ReviewLog r WHERE r.user.userId = :userId " +
           "AND r.reviewedAt >= :start AND r.reviewedAt <= :end")
    Page<ReviewLog> findByUserIdAndDateRange(@Param("userId") Long userId,
                                             @Param("start") LocalDateTime start,
                                             @Param("end") LocalDateTime end,
                                             Pageable pageable);

    long countByUser_UserId(Long userId);

    @Query("SELECT AVG(r.result) FROM ReviewLog r WHERE r.user.userId = :userId")
    Double findAverageResultByUserId(@Param("userId") Long userId);

    @Query("SELECT CAST(r.reviewedAt AS date) as reviewDate, COUNT(r) FROM ReviewLog r " +
           "WHERE r.user.userId = :userId AND r.reviewedAt >= :since " +
           "GROUP BY CAST(r.reviewedAt AS date) ORDER BY reviewDate DESC")
    java.util.List<Object[]> countReviewsByDay(@Param("userId") Long userId, @Param("since") LocalDateTime since);

    @Query("SELECT COUNT(r) FROM ReviewLog r WHERE r.user.userId = :userId AND r.reviewedAt >= :since")
    long countByUserIdSince(@Param("userId") Long userId, @Param("since") LocalDateTime since);
}
