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
import { GenerateTextOptions } from '@/types/ai';

/**
 * Non-streaming Text Generation with Smart Dynamic Model Router Fallback
 * Resolves the optimal model chain based on task type and message complexity,
 * automatically cascading through models with in-memory cooldown to avoid rate limit pauses.
 */
export async function generateText(
  options: GenerateTextOptions,
  config: { apiKey: string }
): Promise<string> {
  const { messages, temperature, models } = options;
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
  const lastMessageContent = lastMessage?.content || '';
  const modelErrors: Record<string, string> = {};

  const rawModels =
    models && models.length > 0
      ? models
      : resolveModelChain({
          task: options.taskType,
          content: typeof lastMessageContent === 'string' ? lastMessageContent : '',
          messageLength: typeof lastMessageContent === 'string' ? lastMessageContent.length : 0,
        });

  // Health-aware ordering: puts healthy models first to avoid 429 latency pauses
  const modelsToTry = orderChainByHealth(rawModels);

  for (const model of modelsToTry) {
    try {
      console.log(`[Text Router] Attempting generateText with model: "${model}"`);

      const isGemma = model.startsWith('gemma');
      const chatConfig: any = {
        temperature: temperature ?? 1.0,
      };

      let messagePayload = lastMessageContent;
      // Gemma open models typically don't accept systemInstruction in config; embed in prompt
      if (!isGemma && systemInstruction) {
        chatConfig.systemInstruction = systemInstruction;
      } else if (isGemma && systemInstruction) {
        messagePayload = `${systemInstruction}\n\n${lastMessageContent}`;
      }

      const chat = ai.chats.create({
        model,
        history: isGemma ? [] : history,
        config: chatConfig,
      });

      const response = await chat.sendMessage({
        message: messagePayload,
      });

      if (response.text !== undefined && response.text !== null) {
        recordModelSuccess(model);
        console.log(`[Text Router] Successfully generated text using model: "${model}"`);
        return response.text;
      }

      throw new Error(`Model "${model}" returned empty text response.`);
    } catch (err: any) {
      if (isAbortError(err)) {
        throw err;
      }

      const msg = err?.message || String(err);

      // Fatal authentication error: halt immediately without useless retries
      if (isAuthError(err)) {
        console.error(`[Text Router] Fatal authentication error with model "${model}": ${msg}`);
        throw err;
      }

      if (isRetryableModelError(err)) {
        recordModelFailure(model, err);
      }

      console.warn(`[Text Router] Model "${model}" failed: ${msg}. Routing to fallback model...`);
      modelErrors[model] = msg;
    }
  }

  console.error('[Text Router] All fallback models failed for generateText:', modelErrors);
  throw new Error(`All models failed in generateText: ${JSON.stringify(modelErrors)}`);
}
