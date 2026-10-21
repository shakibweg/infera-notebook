import {
  resolveModelChain,
  orderChainByHealth,
  recordModelSuccess,
  recordModelFailure,
  isAbortError,
  isAuthError,
  isRetryableModelError,
  isGemini3OrNewer,
} from './model-router';
import { StreamTextOptions, ToolContext, InferaTool } from '@/types/ai';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createTools } from './tools';

/**
 * SSE Text Streaming with Multi-turn Chat, Multimodal support, Zod Tools,
 * and Smart Dynamic Model Router Fallback with in-memory Cooldown.
 */
export async function streamText(options: StreamTextOptions, config: { apiKey: string }) {
  const { messages, context, onFinish, abortSignal } = options;
  const { apiKey } = config;

  const ai = new GoogleGenAI({ apiKey });
  const toolHandlers = context ? createTools(context) : {};

  const functionDeclarations = Object.values(toolHandlers).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.schema as any) as any,
  }));

  const tools = functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined;
  const systemInstruction = messages.find((m: any) => m.role === 'system')?.content;

  // Robust history conversion with Multimodal support
  const conversationMessages = messages.filter((m: any) => m.role !== 'system');
  const history = conversationMessages.slice(0, -1).map((m: any) => {
    const parts: any[] = [];

    // Prioritize 'parts' as they contain rich multimodal and tool data
    if (Array.isArray(m.parts) && m.parts.length > 0) {
      m.parts.forEach((p: any) => {
        if (p.type === 'text') {
          parts.push({ text: p.text });
        } else if (p.type === 'reasoning') {
          // Skip reasoning/thought parts in history for better stability across turns
        } else if (p.type?.startsWith('tool-')) {
          // If it has output, it's a function response turn
          if (p.output) {
            parts.push({
              functionResponse: {
                name: p.type.replace('tool-', ''),
                response: p.output,
                id: p.toolCallId,
              },
            });
          } else {
            // Otherwise it's the function call part
            parts.push({
              functionCall: {
                name: p.type.replace('tool-', ''),
                args: p.args,
                id: p.toolCallId,
              },
            });
          }
        } else if (p.inlineData) {
          // Multimodal parts (images, audio)
          parts.push({ inlineData: p.inlineData });
        }
      });
    } else if (typeof m.content === 'string' && m.content) {
      parts.push({ text: m.content });
    } else if (Array.isArray(m.content)) {
      parts.push(...m.content);
    }

    // Fallback for legacy toolInvocations format
    if (m.toolInvocations && parts.length === 1 && parts[0].text) {
      m.toolInvocations.forEach((ti: any) => {
        if (ti.result !== undefined) {
          parts.push({
            functionResponse: {
              name: ti.toolName,
              response: ti.result,
              id: ti.toolCallId,
            },
          });
        } else {
          parts.push({
            functionCall: {
              name: ti.toolName,
              args: ti.args,
              id: ti.toolCallId,
            },
          });
        }
      });
    }

    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  const lastMessage = conversationMessages[conversationMessages.length - 1];
  const lastMessageParts: any[] = [];

  if (Array.isArray(lastMessage?.parts) && lastMessage.parts.length > 0) {
    lastMessage.parts.forEach((p: any) => {
      if (p.type === 'text') lastMessageParts.push({ text: p.text });
      else if (p.inlineData) lastMessageParts.push({ inlineData: p.inlineData });
    });
  } else if (typeof lastMessage?.content === 'string' && lastMessage.content) {
    lastMessageParts.push({ text: lastMessage.content });
  } else if (Array.isArray(lastMessage?.content)) {
    lastMessageParts.push(...lastMessage.content);
  }

  const rawUserText =
    typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : Array.isArray(lastMessage?.parts)
        ? lastMessage.parts.find((p: any) => p.type === 'text')?.text || ''
        : '';

  const rawModels =
    options.models && options.models.length > 0
      ? options.models
      : resolveModelChain({
          task: options.taskType,
          hasTools: !!tools,
          content: rawUserText,
          messageLength: rawUserText.length,
        });

  // Health-aware ordering: puts healthy models first to avoid 429 latency pauses
  const modelsToTry = orderChainByHealth(rawModels);

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let finalContent = '';
      let finalReasoning = '';
      const finalToolInvocations: any[] = [];
      let streamSucceeded = false;
      const routerErrors: Record<string, string> = {};

      for (const model of modelsToTry) {
        if (abortSignal?.aborted) break;

        let hasSentAnyEvent = false;
        const sendEvent = (data: any) => {
          hasSentAnyEvent = true;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          console.log(`[Stream Router] Attempting chat stream with model: "${model}"`);

          const isGemma = model.startsWith('gemma');
          const chatConfig: any = {
            temperature: 1.0,
          };

          let currentMessage: any = lastMessageParts;
          if (!isGemma && systemInstruction) {
            chatConfig.systemInstruction = systemInstruction;
          } else if (isGemma && systemInstruction) {
            // Embed system instructions into user turn for Gemma open models
            if (Array.isArray(lastMessageParts)) {
              currentMessage = [{ text: `${systemInstruction}\n\n` }, ...lastMessageParts];
            } else if (typeof lastMessageParts === 'string') {
              currentMessage = `${systemInstruction}\n\n${lastMessageParts}`;
            }
          }

          if (tools && !isGemma) {
            chatConfig.tools = tools;
          }

          if (isGemini3OrNewer(model)) {
            chatConfig.thinkingConfig = {
              thinkingLevel: ThinkingLevel.MINIMAL,
              includeThoughts: true,
            };
          }

          const chat = ai.chats.create({
            model,
            history: isGemma ? [] : history,
            config: chatConfig,
          });

          let toolCallsAttempt = 0;

          while (toolCallsAttempt < 10) {
            if (abortSignal?.aborted) break;

            const stream = await chat.sendMessageStream({
              message: currentMessage,
            });

            let assistantContent = '';
            let assistantThoughts = '';
            let toolCalls: any[] = [];

            for await (const chunk of stream) {
              if (abortSignal?.aborted) break;

              const parts = chunk.candidates?.[0]?.content?.parts || [];

              for (const part of parts) {
                // Extract thoughts (reasoning)
                if (part.thought) {
                  const thoughts = part.text || '';
                  if (thoughts) {
                    assistantThoughts += thoughts;
                    finalReasoning += thoughts;
                    sendEvent({
                      type: 'reasoning',
                      content: thoughts,
                      text: thoughts,
                      reasoning: thoughts,
                    });
                  }
                }

                // Extract text
                if (part.text && !part.thought) {
                  const text = part.text;
                  assistantContent += text;
                  finalContent += text;
                  sendEvent({
                    type: 'text',
                    content: text,
                    text: text,
                  });
                }

                // Extract tool calls (function calls)
                const fc = part.functionCall;
                if (fc) {
                  if (!toolCalls.find((tc) => tc.id === fc.id)) {
                    toolCalls.push(fc);
                    sendEvent({
                      type: 'tool_call',
                      id: fc.id,
                      toolCallId: fc.id,
                      name: fc.name,
                      toolName: fc.name,
                      args: fc.args,
                    });
                  }
                }
              }
            }

            if (abortSignal?.aborted) break;

            if (toolCalls.length > 0) {
              toolCallsAttempt++;
              const toolResultsParts: any[] = [];

              for (const tc of toolCalls) {
                const toolName = tc.name;
                const args = tc.args;
                const tool = toolHandlers[toolName];

                if (tool) {
                  try {
                    const [result] = await Promise.all([
                      tool.execute(args),
                      new Promise((resolve) => setTimeout(resolve, 600)),
                    ]);

                    sendEvent({
                      type: 'tool_result',
                      id: tc.id,
                      toolCallId: tc.id,
                      name: toolName,
                      toolName: toolName,
                      result,
                      output: result,
                    });
                    finalToolInvocations.push({ toolCallId: tc.id, toolName, args, result });

                    toolResultsParts.push({
                      functionResponse: { name: toolName, response: result, id: tc.id },
                    });
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    sendEvent({
                      type: 'tool_result',
                      id: tc.id,
                      toolCallId: tc.id,
                      name: toolName,
                      toolName: toolName,
                      error: msg,
                      result: { error: msg },
                      output: { error: msg },
                    });
                    finalToolInvocations.push({ toolCallId: tc.id, toolName, args, error: msg });
                    toolResultsParts.push({
                      functionResponse: { name: toolName, response: { error: msg }, id: tc.id },
                    });
                  }
                } else {
                  const error = 'Tool not found';
                  sendEvent({
                    type: 'tool_result',
                    id: tc.id,
                    toolCallId: tc.id,
                    name: toolName,
                    toolName: toolName,
                    error,
                    result: { error },
                    output: { error },
                  });
                  toolResultsParts.push({
                    functionResponse: { name: toolName, response: { error }, id: tc.id },
                  });
                }
              }

              currentMessage = toolResultsParts;
            } else {
              break;
            }
          }

          streamSucceeded = true;
          recordModelSuccess(model);
          console.log(`[Stream Router] Successfully completed stream with model: "${model}"`);
          break;
        } catch (err: any) {
          if (isAbortError(err) || abortSignal?.aborted) {
            break;
          }
          const msg = err instanceof Error ? err.message : String(err);

          // If the error occurred AFTER data was already transmitted to the user,
          // we cannot transparently swap models midway through an active response
          if (hasSentAnyEvent) {
            console.error(`[Stream Router] Error during streaming with model "${model}":`, err);
            if (isRetryableModelError(err)) {
              recordModelFailure(model, err);
            }
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'error', message: 'Streaming interrupted' })}\n\n`
              )
            );
            controller.error(err);
            return;
          }

          // Fatal authentication error: fails immediately without cycling through models
          if (isAuthError(err)) {
            console.error(
              `[Stream Router] Fatal authentication error with model "${model}": ${msg}`
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'error', message: 'Invalid API key or unauthorized request.' })}\n\n`
              )
            );
            controller.error(err);
            return;
          }

          // Record failure cooldown and fallback to next model
          if (isRetryableModelError(err)) {
            recordModelFailure(model, err);
          }

          console.warn(
            `[Stream Router] Model "${model}" failed before streaming: ${msg}. Routing to fallback model...`
          );
          routerErrors[model] = msg;
        }
      }

      try {
        if (!streamSucceeded && !abortSignal?.aborted) {
          console.error('[Stream Router] All chat fallback models failed:', routerErrors);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                message: 'All AI models are temporarily unavailable. Please try again shortly.',
              })}\n\n`
            )
          );
          controller.error(new Error(`All chat models failed: ${JSON.stringify(routerErrors)}`));
        }
      } finally {
        if (onFinish && (finalContent || finalReasoning || finalToolInvocations.length > 0)) {
          await onFinish({
            content: finalContent,
            reasoning: finalReasoning || undefined,
            toolInvocations: finalToolInvocations,
          });
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });
}
