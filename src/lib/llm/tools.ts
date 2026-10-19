import { initializeVectorStore } from '@/lib/pinecone';
import { ToolContext, InferaTool } from '@/types/ai';
import { z } from 'zod';

/**
 * Tools Registry
 * This file centralizes all tool definitions used by the AI agent.
 */

/**
 * Creates tools for the AI agent context using Zod schemas with descriptive fields.
 */
export function createTools(context: ToolContext): Record<string, InferaTool> {
  const searchInVectorStore: InferaTool = {
    name: 'searchInVectorStore',
    description:
      'Search for relevant content in the knowledge base (vector store) to answer user questions with accurate context.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'The specific search query string to find relevant note snippets or document sections.'
        ),
    }),
    execute: async ({ query }) => {
      const vs = await initializeVectorStore();
      const filter: any = { userId: context.userId, notebookId: context.notebookId };
      if (context.sourceIds?.length) filter.sourceId = { $in: context.sourceIds };
      const results = await vs!.similaritySearch(query, 10, filter);
      return {
        success: true,
        results: results.map((d) => ({
          content: d.pageContent,
          metadata: d.metadata,
        })),
      };
    },
  };

  // Add more tools here to the registry as needed
  return {
    [searchInVectorStore.name]: searchInVectorStore,
  };
}
