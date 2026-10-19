# Infera Notebook · Architecture

This document outlines the technical architecture of Infera Notebook, explaining how we handle sourcing, AI processing, and interactive real-time experiences.

---

## 🏗️ System Overview

Infera Notebook is built on a modern, event-driven serverless architecture designed for low-latency AI interactions and high-volume media processing.

```mermaid
graph TD
    User((User)) <--> NextJS[Next.js Frontend / App Router]
    NextJS <--> API[Next.js API Routes / Server Actions]
    API <--> Prisma[Prisma ORM / Neon PostgreSQL]

    API <--> SC[Inngest Event Bus]
    SC <--> Worker[Inngest Background Workers]

    API <--> S3[Cloudflare R2 / S3 Storage]
    Worker <--> Pinecone[Pinecone Vector DB]

    API <--> LLM[LLMs: Gemini 1.5, Llama 3.1, etc.]
    Worker <--> LLM
```

---

## 📥 Sourcing & Vectorization Pipeline

When a user adds a source (PDF, URL, YouTube Video), it undergoes an automated vectorization process to enable RAG (Retrieval-Augmented Generation).

```mermaid
sequenceDiagram
    participant U as User
    participant A as API / POST Source
    participant S3 as Cloudflare R2
    participant I as Inngest (process-source)
    participant VC as Pinecone Vector Store
    participant AI as Google AI (Gemini)

    U->>S3: Upload File (Presigned URL)
    U->>A: Create Source Record
    A->>I: Trigger notebook/source-process
    activate I
    I->>S3: Download & Extract Text
    I->>I: Split into chunks
    I->>AI: Generate Embeddings
    I->>VC: Save Vectors with Metadata
    I->>Prisma: Set Status: SUCCESS
    deactivate I
    I-->>U: SSE Notification (Realtime UI Update)
```

**Key Technologies:**

- **LangChain**: Used for document loading and text splitting.
- **Pinecone**: Serves as the long-term memory for notebook context.

---

## 📝 Note Generation Workflow

Notes (Mindmaps, Quizzes, FAQ, etc.) are generated asynchronously to maintain a responsive UI.

```mermaid
graph LR
    Req[User Request] --> Prisma[Create Note Record: PROCESSING]
    Prisma --> Event[Inngest: note/created]
    Event --> Context[Retrieve Context from Pinecone]
    Context --> Registry[Note UI Registry / Handlers]
    Registry --> Prompt[Centralized AIService]
    Prompt --> JSON[Structured JSON Generation]
    JSON --> Save[Save to Prisma: SUCCESS]
    Save --> UI[SSE Realtime Update]
```

**Generation Strategy:**

- Each note type has a dedicated **Handler** in `registries/note-registry.ts`.
- We use `AIService.generateObject` with strict JSON schemas to ensure reliable UI rendering.

---

## 🎙️ Interactive Voice Agent (Real-time)

The voice agent enables a low-latency, "interruptible" conversation about the notebook content using a combination of specialized models.

```mermaid
sequenceDiagram
    participant U as User
    participant H as useFlux (ASR Hook)
    participant W as Worker Gateway
    participant A as API (Voice Chat)
    participant T as Deepgram Aura-2 (TTS)
    participant AI as Google AI (Gemini)

    U->>H: User Speaks (Audio Chunks)
    H->>W: Stream PCM via WebSocket
    W-->>H: Return Live Transcription
    H->>A: POST transcript (on silence)
    A->>AI: Google AI (multimodal context)
    AI-->>A: JSON (Selected Speaker + Text)
    A->>T: Generate Audio (TTS)
    T-->>U: Play AI Response
    Note over U,H: User speaks -> Interrupt AI audio/thinking
```

**Performance Optimizations:**

- **Deepgram Flux**: Specifically configured with `eot_threshold=0.7` for natural turn-taking.
- **Multimodal Context**: Uses Gemini's large context window to maintain document awareness across turns.
- **Dual-Layer Guard**: Combines `json_object` enforcement with explicit prompt instructions for reliable speaker selection.

---

## 🏛️ Storage Strategy

- **Database**: Neon (PostgreSQL) for transactional data (Users, Notebooks, Notes).
- **Blob Storage**: Cloudflare R2 for binary assets (Audio overviews, Slide images, PDF sources).
- **Public Assets**: Short-lived **Presigned URLs** are used for all media to ensure security while maintaining high performance.
