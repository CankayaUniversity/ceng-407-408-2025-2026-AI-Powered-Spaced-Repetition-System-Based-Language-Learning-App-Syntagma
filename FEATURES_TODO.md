# Features to Add

1) Known words intake API for extension on new account signup
- Add API endpoint to receive known words from extension.
- New account flow should offer two options:
  - Select level (A1, A2, B1, B2) and add known words based on level.
  - Start from zero.
- Known words are determined from dictionary data.

2) E-book support for .pub files
- Add extension to store .pub files in the repository/storage.

3) Track reading progress
- Store the last read page for e-books.

4) Flashcard collection field
- Add a database field for flashcard collections.

5) Auto-mark known words after spaced repetition threshold
- If a flashcard has been answered correctly multiple times and its FSRS interval exceeds 25 days,
  mark the flashcard word as known.
- Known words should no longer appear in reviews.
