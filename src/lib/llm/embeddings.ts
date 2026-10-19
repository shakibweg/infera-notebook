import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import {
  EMBEDDING_MODEL_ID,
  GEMINI_EMBEDDING_BATCH_SIZE,
  GEMINI_EMBEDDING_DIMENSIONALITY,
} from '@/lib/constants';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from './config';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes an embedding call with automatic retry and backoff on rate limit (429) errors.
 */
async function embedWithRetry(
  google: GoogleGenAI,
  content: string,
  retries = 4
): Promise<number[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await google.models.embedContent({
        model: EMBEDDING_MODEL_ID,
        contents: content,
        config: { outputDimensionality: GEMINI_EMBEDDING_DIMENSIONALITY },
      });

      const values = response.embeddings?.[0]?.values;
      if (!values) {
        throw new Error('No embedding returned from Gemini API');
      }

      return values;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit =
        errorMessage.includes('429') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('Quota exceeded');

      if (isRateLimit && attempt < retries) {
        // Parse retry delay if provided by Google (e.g., "Please retry in 25.79s")
        const match = errorMessage.match(/retry in ([0-9.]+)s/i);
        const retryDelaySec = match ? parseFloat(match[1]) : 0;
        const waitMs =
          retryDelaySec > 0
            ? Math.ceil(retryDelaySec * 1000) + 1000
            : Math.min(2000 * Math.pow(2, attempt), 30000) + Math.floor(Math.random() * 1000);

        console.warn(
          `[Gemini Embeddings] Rate limit encountered. Retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})...`
        );
        await sleep(waitMs);
        continue;
      }

      throw error;
    }
  }

  throw new Error('Failed to embed content after maximum retries');
}

/**
 * Gemini Embedding - Query (Asymmetric)
 * Uses the 'search_query' task type instruction as recommended for Gemini 2.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const google = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const query = `task: search result | query: ${text}`;
  return embedWithRetry(google, query);
}

/**
 * Gemini Embedding - Documents (Asymmetric)
 * Uses the 'title: none | text: {content}' format for documents as recommended.
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const google = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const batchSize = GEMINI_EMBEDDING_BATCH_SIZE;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const batchPromises = batch.map((text) => {
      const doc = `title: none | text: ${text}`;
      return embedWithRetry(google, doc);
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // If more batches remain, pause briefly to respect Gemini rate limits (100 RPM)
    if (i + batchSize < texts.length) {
      await sleep(1000);
    }
  }

  return results;
}

/**
 * Functional embeddings implementation for LangChain vector stores.
 */
export const vectorEmbeddings: EmbeddingsInterface = {
  embedQuery,
  embedDocuments,
};
