import { CHAT_MODEL_ID } from '@/lib/constants';
import { StreamTextOptions, ToolContext, InferaTool } from '@/types/ai';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createTools } from './tools';

/**
 * SSE Text Streaming with Multi-turn Chat, Multimodal support, and Zod Tools
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
          // unless explicitly required by the model.
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

  if (Array.isArray(lastMessage.parts) && lastMessage.parts.length > 0) {
    lastMessage.parts.forEach((p: any) => {
      if (p.type === 'text') lastMessageParts.push({ text: p.text });
      else if (p.inlineData) lastMessageParts.push({ inlineData: p.inlineData });
    });
  } else if (typeof lastMessage.content === 'string' && lastMessage.content) {
    lastMessageParts.push({ text: lastMessage.content });
  } else if (Array.isArray(lastMessage.content)) {
    lastMessageParts.push(...lastMessage.content);
  }

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let finalContent = '';
      let finalReasoning = '';
      const finalToolInvocations: any[] = [];
      const sendEvent = (data: any) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const chat = ai.chats.create({
          model: CHAT_MODEL_ID,
          history,
          config: {
            systemInstruction,
            tools,
            // Gemini 3 recommends temperature 1.0 for optimal reasoning
            temperature: 1.0,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.MINIMAL,
              includeThoughts: true,
            },
          },
        });

        let currentMessage: any = lastMessageParts;
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
                  sendEvent({ type: 'reasoning', content: thoughts });
                }
              }

              // Extract text
              if (part.text && !part.thought) {
                const text = part.text;
                assistantContent += text;
                finalContent += text;
                sendEvent({ type: 'text', content: text });
              }

              // Extract tool calls (function calls)
              const fc = part.functionCall;
              if (fc) {
                // Ensure we don't add the same function call multiple times if it spans chunks
                if (!toolCalls.find((tc) => tc.id === fc.id)) {
                  toolCalls.push(fc);
                  // Emit event immediately so the UI shows the loading indicator
                  sendEvent({
                    type: 'tool_call',
                    id: fc.id,
                    name: fc.name,
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
                  // Add a small artificial delay (min 600ms) so the UI shimmer is actually visible to the user
                  // especially for fast operations like vector searches.
                  const [result] = await Promise.all([
                    tool.execute(args),
                    new Promise((resolve) => setTimeout(resolve, 600)),
                  ]);

                  sendEvent({ type: 'tool_result', id: tc.id, result });
                  finalToolInvocations.push({ toolCallId: tc.id, toolName, args, result });

                  // Mandatory: map function ID back to the response turn
                  toolResultsParts.push({
                    functionResponse: { name: toolName, response: result, id: tc.id },
                  });
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  sendEvent({ type: 'tool_result', id: tc.id, error: msg });
                  finalToolInvocations.push({ toolCallId: tc.id, toolName, args, error: msg });
                  toolResultsParts.push({
                    functionResponse: { name: toolName, response: { error: msg }, id: tc.id },
                  });
                }
              } else {
                const error = 'Tool not found';
                sendEvent({ type: 'tool_result', id: tc.id, error });
                toolResultsParts.push({
                  functionResponse: { name: toolName, response: { error }, id: tc.id },
                });
              }
            }

            // Next turn with tool results
            currentMessage = toolResultsParts;
          } else {
            break;
          }
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.error('Gemini 3 Stream Error:', err);
          sendEvent({ type: 'error', message: 'Streaming failed' });
          controller.error(err);
        }
      } finally {
        if (onFinish && (finalContent || finalReasoning || finalToolInvocations.length > 0)) {
          await onFinish({
            content: finalContent,
            reasoning: finalReasoning || undefined,
            toolInvocations: finalToolInvocations,
          });
        }
        controller.close();
      }
    },
  });
}
