/**
 * Inngest Background Function API
 * This endpoint serves as the communication bridge between Inngest and our application.
 * It exposes our background functions so they can be triggered by events and managed
 * with durable execution, retries, and state management.
 */
import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { processSource, createNote } from '@/inngest/functions';

/**
 * Configure the Inngest serve handler.
 * - processSource: Handles document ingestion and vectorization.
 * - createNote: Generates AI-based notes (Mindmaps, Podcasts, etc.).
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processSource, createNote],
});
