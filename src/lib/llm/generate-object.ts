import { GoogleGenAI } from '@google/genai';
import { CHAT_MODEL_ID } from '@/lib/constants';
import { GenerateObjectOptions } from '@/types/ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

/**
 * Structured JSON Generation using the Gemini 3 Chat System and Zod
 * Supports Multimodal inputs and follows Best Practices.
 */
export async function generateObject<T>(
  options: GenerateObjectOptions,
  config: { apiKey: string }
): Promise<T> {
  const { messages, outputSchema, temperature } = options;
  const { apiKey } = config;

  const ai = new GoogleGenAI({ apiKey });

  const jsonSchema =
    outputSchema instanceof z.ZodType
      ? (zodToJsonSchema(outputSchema as any) as any)
      : outputSchema;

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
      temperature: temperature ?? 1.0,
      responseMimeType: 'application/json',
      responseJsonSchema: jsonSchema,
    },
  });

  const response = await chat.sendMessage({
    message: lastMessageContent,
  });

  if (!response.text) {
    throw new Error('Gemini 3 Chat: No response text returned for generateObject');
  }

  try {
    return JSON.parse(response.text) as T;
  } catch (error) {
    console.error('Gemini 3 Chat: Failed to parse structured output:', response.text);
    throw new Error('Gemini 3 Chat: Invalid JSON returned from model');
  }
}
