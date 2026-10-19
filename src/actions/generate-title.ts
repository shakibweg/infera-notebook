import { generateText, googleConfig } from '@/lib/llm';

/**
 * Generates a concise, descriptive title for a chat note based on its content.
 * @param content - The text content of the chat/note
 * @returns A promise resolving to a short title string
 */
export async function generateNoteTitleFromMessage(content: string): Promise<string> {
  const prompt = `
    You are an expert editor. Given the following note content, generate a very concise (3-5 words), professional title that summarizes the main topic.
    
    CONTENT:
    ${content}
    
    Return only the title, no quotes or extra text.
  `;

  try {
    const result = await generateText(
      {
        messages: [
          { role: 'system', content: 'You are a helpful assistant that generates concise titles.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      },
      googleConfig
    );

    return result?.trim() || 'Chat Note';
  } catch (error) {
    console.error('[GENERATE_NOTE_TITLE_ERROR]', error);
    return 'Chat Note';
  }
}
