import { GoogleGenAI } from '@google/genai';
import { Document } from '@langchain/core/documents';
import { googleConfig } from '@/lib/llm';

/**
 * Emotion enum for structured transcription output.
 */
const Emotion = {
  Happy: 'happy',
  Sad: 'sad',
  Angry: 'angry',
  Neutral: 'neutral',
} as const;

/**
 * Schema for the Gemini structured transcription response.
 */
const TRANSCRIPTION_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    summary: { type: 'STRING' as const },
    segments: {
      type: 'ARRAY' as const,
      items: {
        type: 'OBJECT' as const,
        properties: {
          timestamp: { type: 'STRING' as const },
          content: { type: 'STRING' as const },
          language: { type: 'STRING' as const },
          language_code: { type: 'STRING' as const },
          translation: { type: 'STRING' as const },
          emotion: { type: 'STRING' as const, enum: Object.values(Emotion) },
        },
        required: ['timestamp', 'content', 'language', 'language_code', 'emotion'],
      },
    },
  },
  required: ['summary', 'segments'],
};

/**
 * Prompt for detailed YouTube video transcription via Gemini.
 */
const TRANSCRIPTION_PROMPT = `
Process the audio/video file and generate a detailed transcription.
Requirements:
1. Provide accurate timestamps for each segment (Format: MM:SS).
2. Detect the primary language of each segment.
3. If the segment is in a language different than English, also provide the English translation.
4. Identify the primary emotion of the speaker in this segment. You MUST choose exactly one of the following: Happy, Sad, Angry, Neutral.
5. Provide a brief summary of the entire audio at the beginning.
`;

interface TranscriptionSegment {
  timestamp: string;
  content: string;
  language: string;
  language_code: string;
  translation?: string;
  emotion: string;
}

interface TranscriptionResult {
  summary: string;
  segments: TranscriptionSegment[];
}

/**
 * Converts a YouTube video to vectorizable Documents using Gemini API.
 *
 * Instead of relying on YoutubeLoader (which only extracts basic transcripts),
 * this uses Gemini's multimodal capabilities to process the YouTube URL directly,
 * producing rich transcription with timestamps, language detection, translation,
 * and emotion analysis.
 *
 * @param url - The YouTube video URL
 * @returns Array of LangChain Documents with enriched metadata
 */
export async function youtubeToVector(url: string): Promise<Document[]> {
  try {
    const ai = new GoogleGenAI({ apiKey: googleConfig.apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ fileData: { fileUri: url } }, { text: TRANSCRIPTION_PROMPT }],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: TRANSCRIPTION_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('No response text returned from Gemini API');
    }

    const result: TranscriptionResult = JSON.parse(text);

    if (!result.segments || result.segments.length === 0) {
      throw new Error('No transcription segments returned from Gemini API');
    }

    // Convert each segment into a LangChain Document
    const documents: Document[] = result.segments.map((segment, index) => {
      // Use translation if available, otherwise use the original content
      const pageContent = segment.translation
        ? `[${segment.timestamp}] ${segment.content}\n[Translation] ${segment.translation}`
        : `[${segment.timestamp}] ${segment.content}`;

      return new Document({
        pageContent,
        metadata: {
          source: url,
          type: 'youtube',
          timestamp: segment.timestamp,
          language: segment.language,
          languageCode: segment.language_code,
          emotion: segment.emotion,
          segmentIndex: index,
          summary: index === 0 ? result.summary : undefined,
        },
      });
    });

    // Prepend a summary document for context
    const summaryDoc = new Document({
      pageContent: `[Summary] ${result.summary}`,
      metadata: {
        source: url,
        type: 'youtube',
        isSummary: true,
      },
    });

    return [summaryDoc, ...documents];
  } catch (error) {
    throw new Error(`Failed to convert YouTube to vector: ${error}`);
  }
}
