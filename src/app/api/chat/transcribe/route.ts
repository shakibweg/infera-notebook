import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '@/lib/llm/config';
import { CHAT_ROUTER_MODELS } from '@/lib/llm/model-router';

export async function POST(req: Request) {
  const google = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 });
    }

    // 10MB limit
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 413 });
    }

    // Convert File to Base64 for Gemini
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    let transcript = '';
    const errors: Record<string, string> = {};

    for (const model of CHAT_ROUTER_MODELS) {
      try {
        const response = await google.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    data: base64Audio,
                    mimeType: audioFile.type || 'audio/webm',
                  },
                },
                {
                  text: 'Transcribe this audio exactly as spoken. Return only the transcript text without any preamble or conversational fillers.',
                },
              ],
            },
          ],
        });

        transcript = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (transcript) {
          break;
        }
      } catch (err: any) {
        errors[model] = err?.message || String(err);
        console.warn(
          `[Transcribe Router] Model "${model}" failed: ${errors[model]}. Trying next model...`
        );
      }
    }

    if (!transcript && Object.keys(errors).length > 0) {
      throw new Error(`All models failed: ${JSON.stringify(errors)}`);
    }

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error('[TRANSCRIBE_API_ERROR]', error);
    return NextResponse.json({ error: 'Failed to transcribe audio' }, { status: 500 });
  }
}
