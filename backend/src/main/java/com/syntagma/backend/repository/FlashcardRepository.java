package com.syntagma.backend.repository;

import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface FlashcardRepository extends JpaRepository<Flashcard, Long> {

    Page<Flashcard> findByUser_UserId(Long userId, Pageable pageable);

    Page<Flashcard> findByUser_UserIdAndKnowledgeStatus(Long userId, KnowledgeStatus status, Pageable pageable);

    @Query("SELECT f FROM Flashcard f WHERE f.user.userId = :userId AND " +
           "(LOWER(f.lemma) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(f.translation) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<Flashcard> searchByUserIdAndTerm(@Param("userId") Long userId,
                                          @Param("search") String search,
                                          Pageable pageable);

    @Query("SELECT f FROM Flashcard f WHERE f.user.userId = :userId " +
           "AND (f.knowledgeStatus IS NULL OR f.knowledgeStatus <> :knownStatus) " +
           "AND NOT EXISTS (SELECT 1 FROM SrsState s WHERE s.flashcard = f) " +
           "ORDER BY f.createdAt ASC")
    List<Flashcard> findNewCards(@Param("userId") Long userId,
                                 @Param("knownStatus") KnowledgeStatus knownStatus);
}
