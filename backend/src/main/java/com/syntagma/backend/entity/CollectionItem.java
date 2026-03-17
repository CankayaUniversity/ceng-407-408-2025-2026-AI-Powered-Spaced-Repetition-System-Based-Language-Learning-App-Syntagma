package com.syntagma.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.io.Serializable;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@IdClass(CollectionItem.CollectionItemId.class)
public class CollectionItem {

    @Id
    @Column(name = "collection_id")
    private Long collectionId;

    @Id
    @Column(name = "flashcard_id")
    private Long flashcardId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "collection_id", insertable = false, updatable = false)
    private Collection collection;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "flashcard_id", insertable = false, updatable = false)
    private Flashcard flashcard;

    private LocalDateTime addedAt;

    @Getter
    @Setter
    public static class CollectionItemId implements Serializable {
        private Long collectionId;
        private Long flashcardId;

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            CollectionItemId that = (CollectionItemId) o;
            if (!collectionId.equals(that.collectionId)) return false;
            return flashcardId.equals(that.flashcardId);
        }

        @Override
        public int hashCode() {
            int result = collectionId.hashCode();
            result = 31 * result + flashcardId.hashCode();
            return result;
        }
    }
}
