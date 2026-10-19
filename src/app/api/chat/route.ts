/**
 * Semantic Chat API
 * Orchestrates the RAG (Retrieval-Augmented Generation) chat experience.
 * Handles user message persistence, credit management, and AI streaming.
 */
import { initializeVectorStore } from '@/inngest/helpers';
import { streamText, googleConfig } from '@/lib/llm';
import { getCurrentUser } from '@/actions/user';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MessageRole } from '@/generated/prisma/enums';
import { deductCredit } from '@/actions/credits';
import { INTERACTIVE_AGENT_SYSTEM_PROMPT } from '@/lib/prompts';

/**
 * Main Chat Handler (POST)
 * 1. Authenticates the user.
 * 2. Deducts a credit for the interaction.
 * 3. Persists the user's message to the database.
 * 4. Initiates a streaming response from the LLM with context.
 * 5. Persists the AI's response upon completion of the stream.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sourceIds, messages, notebookId } = await req.json();

    if (!notebookId) {
      return NextResponse.json({ error: 'notebookId is required' }, { status: 400 });
    }

    // Verify notebook ownership to prevent IDOR vulnerabilities
    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: user.id,
      },
    });

    if (!notebook) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have access to this notebook' },
        { status: 403 }
      );
    }

    // Get the last message (user's current message)
    const lastMessage = messages?.[messages?.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return NextResponse.json({ error: 'Last message must be from user' }, { status: 400 });
    }

    // Deduct credit after verifying notebook ownership and input payload
    const success = await deductCredit(user.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Credits exhausted. Please wait for the daily reset.' },
        { status: 403 }
      );
    }

    // Capture parts for persistence - handle both format variations
    const userParts =
      lastMessage.parts ||
      (lastMessage.content ? [{ type: 'text', text: lastMessage.content }] : []);

    await prisma.message.create({
      data: {
        notebookId: notebookId,
        role: MessageRole.user,
        parts: userParts,
      },
    });

    // Create tool context with user and notebook information
    const toolContext = {
      notebookId: notebookId,
      sourceIds: sourceIds || [],
      userId: user.id,
    };

    // Save assistant message after streaming completes
    const onFinish = async (result: {
      content: string;
      reasoning?: string;
      toolInvocations: any[];
    }) => {
      try {
        const assistantParts: any[] = [];

        // Add reasoning part if it exists
        if (result.reasoning) {
          assistantParts.push({ type: 'reasoning', reasoning: result.reasoning });
        }

        // Add text part
        assistantParts.push({ type: 'text', text: result.content });

        // Add tool invocations as separate parts for persistence
        if (result.toolInvocations && result.toolInvocations.length > 0) {
          result.toolInvocations.forEach((ti) => {
            assistantParts.push({
              type: `tool-${ti.toolName}`,
              toolCallId: ti.toolCallId,
              args: ti.args,
              state: 'output-available',
              output: ti.result,
            });
          });
        }

        await prisma.message.create({
          data: {
            notebookId: notebookId,
            role: MessageRole.assistant,
            parts: assistantParts,
          },
        });
      } catch (error) {
        console.error('[CHAT] Failed to save assistant message:', error);
      }
    };

    const stream = await streamText(
      {
        messages: [{ role: 'system', content: INTERACTIVE_AGENT_SYSTEM_PROMPT }, ...messages],
        context: toolContext,
        onFinish,
        abortSignal: req.signal,
      },
      googleConfig
    );

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[CHAT]', error);
    return NextResponse.json({ error: 'Failed to chat' }, { status: 500 });
  }
}
