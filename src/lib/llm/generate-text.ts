import { GoogleGenAI } from '@google/genai';
import { CHAT_MODEL_ID } from '@/lib/constants';
import { GenerateTextOptions } from '@/types/ai';

/**
 * Non-streaming Text Generation using the Gemini 3 Chat System
 * Supports Multimodal inputs and follows Best Practices (Temp 1.0).
 */
export async function generateText(
  options: GenerateTextOptions,
  config: { apiKey: string }
): Promise<string> {
  const { messages, temperature } = options;
  const { apiKey } = config;

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = messages.find((m: any) => m.role === 'system')?.content;

  const conversationMessages = messages.filter((m: any) => m.role !== 'system');
  const history = conversationMessages.slice(0, -1).map((m: any) => {
    const parts: any[] = [];
    if (typeof m.content === 'string') {
      parts.push({ text: m.content });
    } else if (Array.isArray(m.content)) {
      parts.push(...m.content);
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  const lastMessage = conversationMessages[conversationMessages.length - 1];
  const lastMessageContent = lastMessage.content;

  const chat = ai.chats.create({
    model: CHAT_MODEL_ID,
    history,
    config: {
      systemInstruction,
      // Gemini 3 recommends temperature 1.0
      temperature: temperature ?? 1.0,
    },
  });

  const response = await chat.sendMessage({
    message: lastMessageContent,
  });

  return response.text || '';
}
