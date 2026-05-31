<p align="center">
  <img src="extension/icons/icon128.png" alt="Syntagma Logo" width="80" />
</p>

<h1 align="center">Syntagma</h1>

<p align="center">
  <strong>AI-Powered Spaced Repetition Language Learning Platform</strong>
</p>

<p align="center">
  Learn English vocabulary naturally — while reading ebooks, browsing the web, or watching videos with subtitles.
</p>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Chrome Extension Setup](#chrome-extension-setup)
  - [Mobile App Setup](#mobile-app-setup)
- [Configuration](#configuration)
- [Team](#team-members)

---

## Overview

**Syntagma** is a multi-platform language learning application designed for Turkish speakers learning English. It combines AI-powered language assistance, spaced repetition (FSRS algorithm), and immersive content consumption to help users acquire vocabulary in context.

Users encounter new words while reading ebooks, browsing websites, or watching videos through custom video player and Netflix/YouTube. Then review them on mobile with scientifically-optimized intervals.

### AI-Powered Language Assistance
 
Syntagma uses AI (via OpenRouter) to provide deep, context-aware language support and not just dictionary lookups:
#### On dictionary pop up there are three AI buttons:
- **Explain Word in Context:** When you click an unknown word,the AI explains its meaning within the specific sentence it appears in, including part of speech, usage notes, common mistakes Turkish learners make, and example sentences.
- **Sentence Translation:** Translate full sentences naturally into Turkish, preserving idiomatic meaning rather than word-by-word translation.
- **Sentence Grammar Breakdown:** Break down complex English sentences into grammatical chunks, explaining each part's function, the overall grammar structure, why that structure is used, and practical tips for learners.
#### In Card Creator:
- **Example Sentence Generation:**Generate new example sentences for any word to reinforce learning with varied contexts.

---

## Features

### Chrome Extension
- **Word Highlighting:** Unknown words are highlighted on any webpage based on your CEFR vocabulary level (A1–C2)
- **Click-to-Translate:** Select any word for instant AI-powered translation and definition via popup
- **Flashcard Creation:** Create flashcards directly from web content with context sentences, or use the dedicated Card Creator page
- **EBook Reader:** Built-in EBook reader with integrated word lookup and comprehension statistics
- **Video Subtitles:** Overlay subtitles on Netflix and YouTube with word-level interaction
- **Video Player:** Built-in video player for imported video files with subtitle display and word lookup
- **Page Analysis:** Real-time comprehension percentage and i+1 sentence detection for any English text
- **NLP Lemmatization:** Accurate word root detection using compromise.js for proper vocabulary tracking
- **Bilingual UI:** Full Turkish/English interface with locale toggle
- **Offline Dictionary:** Bundled English–Turkish dictionary for instant lookups without internet
- **CEFR Level Intake:** Import your existing vocabulary by selecting known words at each CEFR level

### Mobile App
- **SRS Review Sessions:** Daily flashcard reviews powered by the FSRS algorithm
- **Session Summaries:** Track performance after each review session
- **Flashcard Library:** Browse, search, and manage all your flashcards
- **Progress Overview:** Visualize learning streaks, known words, and vocabulary growth
- **CEFR Badges:** Bronze, Silver, and Gold medal progression as vocabulary grows
- **Push Notifications:** Reminders for daily review sessions
- **Offline Mode:** Review cards without internet, sync when back online

### Backend
- **FSRS Algorithm:** Free Spaced Repetition Scheduler for optimal review intervals
- **AI Translation:** Context-aware translations via OpenRouter AI
- **JWT Authentication:** Secure user sessions with token-based auth
- **Media Storage:** S3-compatible (DigitalOcean Spaces) for flashcard screenshots/audio


---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Java 17, Spring Boot 3.2.4, Spring Security, Spring Data JPA |
| Database | PostgreSQL |
| Mobile | React Native (Expo SDK 54), React Navigation |
| Extension | React 19, TypeScript, Vite 8, Zustand, Chrome Manifest V3 |
| AI | OpenRouter API |
| Storage | DigitalOcean Spaces (S3-compatible) |
| Build | Gradle (backend), npm (frontend) |
| Testing | JUnit 5, Vitest, React Testing Library |

---

## Getting Started

### Prerequisites

- **Java 17+** (for backend)
- **PostgreSQL 14+** (database)
- **Node.js 18+** and **npm** (for extension and mobile)
- **Android Studio** or **Expo Go** (for mobile development)
- **Google Chrome** (for extension)

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/CankayaUniversity/ceng-407-408-2025-2026-AI-Powered-Spaced-Repetition-System-Based-Language-Learning-App-Syntagma.git
   cd ceng-407-408-2025-2026-AI-Powered-Spaced-Repetition-System-Based-Language-Learning-App-Syntagma
   ```

2. **Create the PostgreSQL database**
   ```bash
   createdb syntagma
   ```

3. **Configure environment variables**

   Create a `.env` file or set these environment variables:
   ```env
   DB_URL=jdbc:postgresql://localhost:5432/syntagma
   DB_USERNAME=postgres
   DB_PASSWORD=your_password
   JWT_SECRET=your_jwt_secret_key
   JWT_EXPIRATION=86400000
   FRONTEND_URL=http://localhost:3000
   ```

4. **Run the backend**
   ```bash
   cd backend
   ./gradlew bootRun
   ```

   The API will be available at `http://localhost:8080`.

5. **API docs (Swagger UI)**

   Visit `http://localhost:8080/swagger-ui.html` after starting the server.

### Chrome Extension Setup

1. **Install dependencies**
   ```bash
   cd extension
   npm install
   ```

2. **Build the extension**
   ```bash
   npm run build
   ```

3. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the `extension/dist` folder

4. **Development mode** (auto-rebuild on changes)
   ```bash
   npm run dev
   ```

5. **Backend URL**

   The extension connects to the production backend (`https://syntagma.omerhanyigit.online`) by default. This URL is hardcoded in the following files:
   - `src/background/service-worker.ts`
   - `src/shared/backend-ai.ts`
   - `src/shared/cefr-intake.ts`

   If you are self-hosting, update the `BACKEND_URL` constant in these files before building.

### Mobile App Setup

1. **Install dependencies**
   ```bash
   cd mobile
   npm install
   ```

2. **Start the development server**
   ```bash
   npm start
   ```

3. **Run on device/emulator**
   ```bash
   # Android
   npm run android
   ```

Or scan the QR code with **Expo Go** on your device.

4. **Backend URL**
   The mobile app also connects to the production backend by default. The URL is hardcoded in `src/shared/api.js`. If self-hosting, update the `API_BASE_URL` constant in that file. For local development with a physical device, use your machine's local IP (e.g., `http://192.168.1.100:8080`).

---

## Configuration

### Backend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_URL` | PostgreSQL connection URL | `jdbc:postgresql://localhost:5432/syntagma` |
| `DB_USERNAME` | Database username | `postgres` |
| `DB_PASSWORD` | Database password | `password` |
| `JWT_SECRET` | Secret key for JWT token signing | `key` |
| `JWT_EXPIRATION` | Token expiration in milliseconds | `86400000` (24h) |
| `FRONTEND_URL` | Frontend URL for email links | `http://localhost:3000` |

### S3 Storage

For media uploads (flashcard screenshots, audio), configure an S3-compatible storage provider:

| Variable | Description |
|----------|-------------|
| `S3_ENDPOINT` | S3 endpoint URL |
| `S3_REGION` | Storage region |
| `S3_BUCKET` | Bucket name |
| `S3_ACCESS_KEY` | Access key ID |
| `S3_SECRET_KEY` | Secret access key |

### Extension Settings

The extension can be configured through its **Options page** (right-click the extension icon → Options):

- Vocabulary level selection
- Flashcard collection management
- Word highlighting preferences
- Known words import

> **Note:** The backend server URL is not user-configurable from the UI. Both the extension and mobile app default to `https://syntagma.omerhanyigit.online`.


---
This project is developed as part of the CENG 407/408 Innovative System Design and Development Course Project at Cankaya University (2025–2026).

---
#### Team Members:

- İlker Feza Çoban  
- İlayda Sümer  
- Elif Su Tufan  
- Alp Yılmaz
- Sultan Gürbüz 
- Ömerhan Yiğit 
#### Academic Advisor:
Assist. Prof. Dr. Abdül Kadir Görür 
 
<p align="center">
  Built with care by the Syntagma team
</p>
