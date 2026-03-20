package com.syntagma.backend.entity;

import com.syntagma.backend.entity.enums.KnowledgeStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.io.Serializable;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@IdClass(WordKnowledge.WordKnowledgeId.class)
public class WordKnowledge {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Id
    @Column(name = "lemma")
    private String lemma;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    private KnowledgeStatus status;

    private LocalDateTime updatedAt;

    @Getter
    @Setter
    public static class WordKnowledgeId implements Serializable {
        private Long userId;
        private String lemma;

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            WordKnowledgeId that = (WordKnowledgeId) o;
            if (!userId.equals(that.userId)) return false;
            return lemma.equals(that.lemma);
        }

        @Override
        public int hashCode() {
            int result = userId.hashCode();
            result = 31 * result + lemma.hashCode();
            return result;
        }
    }
}
