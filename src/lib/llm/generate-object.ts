import { GoogleGenAI } from '@google/genai';
import {
  resolveModelChain,
  orderChainByHealth,
  recordModelSuccess,
  recordModelFailure,
  isAbortError,
  isAuthError,
  isRetryableModelError,
} from './model-router';
import { GenerateObjectOptions } from '@/types/ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

/**
 * Structured JSON Generation with Model Router Fallback
 * Dynamically cascades through reasoning models (Gemini 3.8 Flash -> 3.6 Flash -> 3.5 Flash Lite -> 3.1 Flash Lite -> 2.5 Flash)
 * with in-memory cooldown to avoid rate-limit pauses and deliver highest-fidelity structured notes.
 */
export async function generateObject<T>(
  options: GenerateObjectOptions,
  config: { apiKey: string }
): Promise<T> {
  const { messages, outputSchema, temperature, models } = options;
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
  const lastMessageContent = lastMessage?.content || '';
  const modelErrors: Record<string, string> = {};

  const rawModels =
    models && models.length > 0
      ? models
      : resolveModelChain({
          task: options.taskType || 'structured_note',
          requiresJson: true,
          content: typeof lastMessageContent === 'string' ? lastMessageContent : '',
        });

  // Health-aware ordering: puts healthy models first to avoid 429 latency pauses
  const modelsToTry = orderChainByHealth(rawModels);

  for (const model of modelsToTry) {
    try {
      console.log(`[Object Router] Attempting generateObject with model: "${model}"`);

      const chat = ai.chats.create({
        model,
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
        throw new Error(`Model "${model}" returned empty response.`);
      }

      const parsed = JSON.parse(response.text) as T;
      recordModelSuccess(model);
      console.log(
        `[Object Router] Successfully generated structured object using model: "${model}"`
      );
      return parsed;
    } catch (err: any) {
      if (isAbortError(err)) {
        throw err;
      }

      const msg = err?.message || String(err);

      // Fatal authentication error: halt immediately without useless retries
      if (isAuthError(err)) {
        console.error(`[Object Router] Fatal authentication error with model "${model}": ${msg}`);
        throw err;
      }

      if (isRetryableModelError(err)) {
        recordModelFailure(model, err);
      }

      console.warn(`[Object Router] Model "${model}" failed: ${msg}. Routing to fallback model...`);
      modelErrors[model] = msg;
    }
  }

  console.error('[Object Router] All fallback models failed for generateObject:', modelErrors);
  throw new Error(`All models failed in generateObject: ${JSON.stringify(modelErrors)}`);
}
