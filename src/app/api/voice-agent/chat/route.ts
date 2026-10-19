import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/actions/user';

import { deductCredit } from '@/actions/credits';
import { voiceAgentChatBodySchema } from '@/validators/agent';
import { generateObject, googleConfig } from '@/lib/llm';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Deduct credit for each voice interaction
    const success = await deductCredit(user.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Credits exhausted. Please wait for the daily reset.' },
        { status: 403 }
      );
    }

    const jsonBody = await req.json();
    const bodyValidation = voiceAgentChatBodySchema.safeParse(jsonBody);

    if (!bodyValidation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: bodyValidation.error.format() },
        { status: 400 }
      );
    }

    const { query, noteId, context, participants, notebookId } = bodyValidation.data;

    const participantsList = Array.isArray(participants)
      ? participants.map((p) => `- ${p.name}: ${p.specialization}`).join('\n')
      : 'No specific participants defined.';

    const systemPrompt = `You are helping a user discuss an "Audio Overview" podcast. 
The following participants are available to speak:
${participantsList}

INSTRUCTIONS:
1. SELECT THE BEST SPEAKER: Look at the user's query and the participants' specializations. The participant most qualified to answer SHOULD be the one speaking.
2. If the query is general or a greeting, the "Host" should respond.
3. If NO ONE is qualified, the most relevant speaker should say: "I am sorry, I am not able to answer this question."
4. SPEAK DIRECTLY: Speak as the chosen character. Use "I" and "me".
5. CONCISE: Keep answers to 1-2 short sentences.
6. FORMAT: Respond ONLY with a valid JSON object: { "speaker": "Name", "response": "Your answer" }. Do not include any other text.

Context from the overview:
"${context}"`;

    // Use a stable, high-performance model for voice interactions via the AI Gateway
    const aiResponse = await generateObject<{ speaker: string; response: string }>(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query || 'Hello' },
        ],
        objectName: 'voice_agent_response',
        outputSchema: {
          type: 'object',
          properties: {
            speaker: { type: 'string' },
            response: { type: 'string' },
          },
          required: ['speaker', 'response'],
          additionalProperties: false,
        },
        notebookId: notebookId || undefined,
      },
      googleConfig
    );

    console.log('[VOICE_CHAT] Model response received via generateObject');
    return NextResponse.json(aiResponse);
  } catch (error) {
    console.error('[VOICE_AGENT_CHAT_ERROR]', error);
    return NextResponse.json(
      {
        error: 'Failed to get agent response',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
