package com.syntagma.backend.repository;

import com.syntagma.backend.entity.Collection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CollectionRepository extends JpaRepository<Collection, Long> {
    Page<Collection> findByUser_UserId(Long userId, Pageable pageable);
}
