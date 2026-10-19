# <img src="public/logo.svg" width="36" height="36" style="vertical-align: middle; margin-right: 12px; margin-bottom: 4px;"> Infera Notebook

<div align="center">

![Infera Notebook Demo](public/demo.png)

**AI-Powered Knowledge Management & Content Generation Platform**

Transform your documents into interactive knowledge bases with AI-powered chat, notes, and multimedia content generation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2.3-blue)](https://react.dev/)

</div>

## 🌟 Features

### 📚 Multi-Format Document Support

Upload and process various file types:

- **Documents**: PDF, DOCX, PPTX, EPUB, TXT
- **Data**: CSV, JSON, JSONL
- **Media**: MP3, M4A, MP4, WebM
- **Web**: URLs, YouTube videos, GitHub repositories
- **Subtitles**: SRT files

### 💬 Intelligent Chat Interface

- Chat with your documents using advanced LLM technology
- Grounded responses with citations and source references
- Real-time streaming responses
- Context-aware conversations across multiple sources

### 📝 Rich Content Generation

Generate various types of content from your sources:

- **📄 Editable Notes**: Collaborative markdown notes with version history
- **🎙️ Audio Overviews**: Narrated summaries with chapters
- **🎬 Video Overviews**: Studio-quality video recaps with slides
- **🗺️ Mind Maps**: Visual knowledge representations
- **❓ FAQs**: Auto-generated question-answer pairs
- **📅 Timelines**: Chronological event sequences
- **📊 Briefing Docs**: Executive summaries and reports
- **📽️ Slide Decks**: Visual presentations with speaker notes
- **📈 Infographics**: Visual data representations
- **🧠 Quizzes**: Interactive knowledge tests
- **🎴 Flash Cards**: Study aids for learning

### 🔍 Advanced Features

- **Vector Search**: Semantic search across all your documents
- **Auto-tagging**: Intelligent content categorization
- **Source Linking**: All generated content stays linked to source material
- **Real-time Updates**: Background processing with Inngest
- **Cloud Storage**: Secure media hosting with AWS S3 / Cloudflare R2
- **Dark Mode**: Beautiful UI with theme support

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20.x or higher
- **PostgreSQL** database
- **pnpm** package manager

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# --- APP CONFIGURATION ---
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# --- DATABASE ---
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# --- AUTHENTICATION ---
BETTER_AUTH_SECRET=your_better_auth_secret
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# --- AI ---
ASSEMBLY_API_KEY=your_assembly_api_key
GEMINI_API_KEY=your_gemini_api_key

# --- VECTOR STORE ---
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=infera-notebook

# --- MEDIA STORAGE (AWS S3 / CLOUDFLARE R2) ---
AWS_REGION=auto
AWS_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=your_r2_access_key_id
AWS_SECRET_ACCESS_KEY=your_r2_secret_access_key
AWS_S3_BUCKET_NAME=infera-notebook

# --- EXTERNAL APIS ---
RESEND_API_KEY=your_resend_api_key
TAVILY_API_KEY=your_tavily_api_key

# --- INNGEST ---
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key
```

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/shakibweg/infera-notebook.git
   cd infera-notebook
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up the database**

   ```bash
   pnpm dlx prisma migrate dev
   ```

4. **Run the development server**

   ```bash
   pnpm run dev
   ```

5. **Run Inngest dev server** (in a separate terminal)

   ```bash
   pnpm run inngest:dev
   ```

   Or run both together:

   ```bash
   pnpm run dev:all
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📖 Usage

### Creating a Notebook

1. Sign in or create an account
2. Create a new notebook
3. Add sources (files, URLs, or YouTube links)
4. Wait for processing to complete
5. Start chatting with your sources!

### Generating Content

1. Select one or more sources
2. Choose a content type from the tools panel
3. Click generate and wait for processing
4. View and edit your generated content

### Chatting with Sources

1. Select the sources you want to query
2. Type your question in the chat input
3. Receive AI-powered responses with citations
4. Save important conversations as notes

## 🛠️ Tech Stack

### Core Framework

- **[Next.js 16](https://nextjs.org/)** - React framework with App Router
- **[React 19](https://react.dev/)** - UI library
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety

### Database & ORM

- **[PostgreSQL](https://www.postgresql.org/)** - Relational database
- **[Prisma](https://www.prisma.io/)** - Next-generation ORM

### Authentication

- **[Better Auth](https://better-auth.com/)** - Authentication and user management

### AI & ML

- **[Google Gemini](https://ai.google.dev/)** - 1.5 Pro, 2.0 Flash, and 3.1 Flash-Lite for text, vision, and real-time interactions
- **[Deepgram](https://www.deepgram.com/)** - Nova-3 (ASR) and Aura-2 (TTS) for high-performance audio intelligence
- **[Google Embeddings](https://ai.google.dev/)** - `gemini-embedding-2` for multi-lingual semantic search
- **[LangChain](https://www.langchain.com/)** - LLM application framework
- **[Pinecone](https://www.pinecone.io/)** - Vector database for semantic search
- **[AssemblyAI](https://www.assemblyai.com/)** - Advanced audio intelligence

### Media & Content

- **[AWS S3 / R2](https://aws.amazon.com/s3/)** - Secure object storage
- **[Remotion](https://www.remotion.dev/)** - Programmatic video generation
- **[BlockNote](https://www.blocknote.dev/)** - Block-based rich text editor

### Background Jobs

- **[Inngest](https://www.inngest.com/)** - Background job processing

### UI Components

- **[shadcn/ui](https://ui.shadcn.com/)** - Beautiful UI components
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first CSS
- **[Lucide React](https://lucide.dev/)** - Icon library
- **[Motion](https://motion.dev/)** - Animation library

### Other Tools

- **[Zod](https://zod.dev/)** - Schema validation
- **[React Hook Form](https://react-hook-form.com/)** - Form management
- **[Zustand](https://zustand-demo.pmnd.rs/)** - State management

## 📁 Project Structure

```
infera-notebook/
├── app/                  # Next.js App Router (Auth, Main, API)
├── actions/              # Server Actions for business logic
├── components/           # UI and Shared React components
├── hooks/                # Custom React hooks
├── inngest/              # Background job workflows
├── prisma/               # Database schema and migrations
├── lib/                  # Utility functions and constants
├── types/                # TypeScript type definitions
├── validators/           # Zod validation schemas
├── public/               # Static assets
└── generated/            # Locally generated Prisma client
```

## 🧪 Development

### Available Scripts

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run start` - Start production server
- `pnpm run lint` - Run ESLint
- `pnpm run db:generate` - Generate Prisma client
- `pnpm run db:migrate` - Run database migrations (dev)
- `pnpm run db:studio` - Open Prisma Studio
- `pnpm run db:reset` - Reset the database
- `pnpm run inngest:dev` - Start Inngest dev server

### Code Style

This project uses:

- **ESLint** for linting
- **TypeScript** for type checking
- **Prettier** (recommended) for code formatting

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- How to set up your development environment
- Our code style and conventions
- How to submit pull requests
- Our review process

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Shakib Khan**

- GitHub: [@shakibweg](https://github.com/shakibweg)
- Email: [shakibweg@gmail.com](mailto:shakibweg@gmail.com)

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- Powered by various AI and ML services

## 📬 Contact

If you have any questions, feedback, or need support:

- **Maintainer**: Shakib Khan
- **Email**: [shakibweg@gmail.com](mailto:shakibweg@gmail.com)
- **GitHub**: [@shakibweg](https://github.com/shakibweg)
- **Issues**: [GitHub Issues](https://github.com/shakibweg/infera-notebook/issues)

---

<div align="center">

Made with ❤️ by [shakibweg](https://github.com/shakibweg)

⭐ Star this repo if you find it helpful!

</div>
