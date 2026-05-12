package com.syntagma.backend.repository;

import com.syntagma.backend.entity.Ebook;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface EbookRepository extends JpaRepository<Ebook, Long> {
    List<Ebook> findByUser_UserIdOrderByCreatedAtDesc(Long userId);
}
