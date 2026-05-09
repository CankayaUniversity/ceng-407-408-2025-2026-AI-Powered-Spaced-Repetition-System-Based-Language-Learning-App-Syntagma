package com.syntagma.backend.repository;

import com.syntagma.backend.entity.SrsState;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface SrsStateRepository extends JpaRepository<SrsState, Long> {

        @Query("SELECT s FROM SrsState s JOIN s.flashcard f WHERE f.user.userId = :userId " +
            "AND s.nextReviewAt <= :now " +
            "AND (f.knowledgeStatus IS NULL OR f.knowledgeStatus <> :knownStatus) " +
            "ORDER BY s.nextReviewAt ASC")
        List<SrsState> findDueCards(@Param("userId") Long userId,
                        @Param("now") LocalDateTime now,
                        @Param("knownStatus") KnowledgeStatus knownStatus);
}
