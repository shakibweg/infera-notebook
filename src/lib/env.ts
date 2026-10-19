/**
 * Centralized environment variable access.
 * This file serves as the single point of truth for server-side environment configurations,
 * allowing for easier validation and management of sensitive API keys and URLs.
 */

// --- CORE AI SERVICES ---
/** Gemini API Key for Gemini models */
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
export const GOOGLE_API_KEY = GEMINI_API_KEY;
/** Nebius API Key for Llama/Qwen models via OpenAI-compatible SDK */
export const NEBIUS_API_KEY = process.env.NEBIUS_API_KEY || '';
/** AssemblyAI Key for STT (Speech-to-Text) transcription */
export const ASSEMBLY_API_KEY = process.env.ASSEMBLY_API_KEY || '';
/** Deepgram API Key for STT (Speech-to-Text) transcription */
export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
/** Base URL for the public-facing application frontend */
export const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || '';

// --- INTERACTIVE VOICE (VAPI) ---
export const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY || '';
export const VAPI_PUBLIC_KEY = process.env.VAPI_PUBLIC_KEY || '';

// --- VECTOR STORE (PINECONE) ---
export const PINECONE_API_KEY = process.env.PINECONE_API_KEY || '';
export const PINECONE_INDEX = process.env.PINECONE_INDEX || '';

// --- MEDIA STORAGE (AWS S3 / CLOUDFLARE R2) ---
export const AWS_REGION = process.env.AWS_REGION || '';
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
export const AWS_ENDPOINT = process.env.AWS_ENDPOINT || '';
export const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';
export const AWS_FORCE_PATH_STYLE =
  process.env.AWS_FORCE_PATH_STYLE === 'true' ||
  (process.env.AWS_FORCE_PATH_STYLE !== 'false' && Boolean(AWS_ENDPOINT));

// --- CLOUDFLARE AI GATEWAY ---
// Removed gateway configuration

// --- SEARCH TOOLS ---
/** Tavily search API key for web-aware AI capabilities */
export const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

// --- AUTH ---
export const BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET || 'dummy_secret_for_build_that_is_long_enough_12345678';
export const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'dummy_client_id';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret';
export const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_dummy_key';
