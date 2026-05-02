package com.syntagma.backend.config;

import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.List;

@Configuration
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final FlashcardRepository flashcardRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) throws Exception {
        // Only run the seeder if the database is completely empty
        if (userRepository.count() == 0) {
            System.out.println("🌱 Database is empty! Seeding mock test values...");

            // Create a Mock User (User ID will likely be 1)
            User testUser = new User();
            testUser.setEmail("test@syntagma.com");
            testUser.setPasswordHash(passwordEncoder.encode("password123"));
            testUser.setCreatedAt(LocalDateTime.now());
            testUser.setStreakCount(0);
            userRepository.save(testUser);

            // Create mock flashcards to exercise 2-button FSRS flow (known/unknown)
            Flashcard f1 = createFlashcard(testUser, "aberration", "sapma, anormallik",
                    "The current weather is an aberration.", "Su anki hava durumu bir sapmadir.");

            Flashcard f2 = createFlashcard(testUser, "ephemeral", "kisa omurlu, gecici",
                    "Fame in the modern world is often ephemeral.", "Modern dunyada sohret genellikle kisa omurludur.");

            Flashcard f3 = createFlashcard(testUser, "cacophony", "kakofoni, uyumsuz ses",
                    "A cacophony of alarms woke me up.", "Bir alarm kakofonisi beni uyandirdi.");

            Flashcard f4 = createFlashcard(testUser, "ubiquitous", "her yerde birden bulunan",
                    "Smartphones have become ubiquitous.", "Akilli telefonlar her yerde bulunur hale geldi.");

            Flashcard f5 = createFlashcard(testUser, "dichotomy", "ikiye bolunme, zitlik",
                    "There is a dichotomy between science and mysticism.", "Bilim ve mistisizm arasinda bir zitlik vardir.");

            Flashcard f6 = createFlashcard(testUser, "serendipity", "tesadufi sans, mutlu rastlanti",
                    "We found the cafe by pure serendipity.", "Kafeyi tamamen tesaduf eseri bulduk.");

            Flashcard f7 = createFlashcard(testUser, "meticulous", "titiz, ayrintici",
                    "She keeps meticulous notes.", "Titiz notlar tutar.");

            Flashcard f8 = createFlashcard(testUser, "resilient", "dayanikli, direncli",
                    "Children are remarkably resilient.", "Cocuklar sasirtici derecede dayaniktir.");

            flashcardRepository.saveAll(List.of(f1, f2, f3, f4, f5, f6, f7, f8));

            System.out.println("✅ Mock data seeding complete! 1 User and 8 Flashcards created.");
        }
    }

    private Flashcard createFlashcard(User user, String lemma, String translation, String source, String example) {
        Flashcard flashcard = new Flashcard();
        flashcard.setUser(user);
        flashcard.setLemma(lemma);
        flashcard.setTranslation(translation);
        flashcard.setSourceSentence(source);
        flashcard.setExampleSentence(example);
        flashcard.setKnowledgeStatus(KnowledgeStatus.UNKNOWN);
        flashcard.setCreatedAt(LocalDateTime.now());
        flashcard.setUpdatedAt(LocalDateTime.now());
        return flashcard;
    }
}
