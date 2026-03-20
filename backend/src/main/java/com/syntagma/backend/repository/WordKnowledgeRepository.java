package com.syntagma.backend.repository;

import com.syntagma.backend.entity.WordKnowledge;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface WordKnowledgeRepository extends JpaRepository<WordKnowledge, WordKnowledge.WordKnowledgeId> {

    Page<WordKnowledge> findByUserId(Long userId, Pageable pageable);

    Page<WordKnowledge> findByUserIdAndStatus(Long userId, KnowledgeStatus status, Pageable pageable);

    Optional<WordKnowledge> findByUserIdAndLemma(Long userId, String lemma);
}
