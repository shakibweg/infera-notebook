import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from './config';

export interface TTSOptions {
  text: string;
  voice?: string;
  multiSpeaker?: {
    speakers: { name: string; voice: string }[];
  };
}

export interface TTSResult {
  success: boolean;
  buffer?: Buffer;
  error?: string;
}

/**
 * Adds a WAV header to a PCM buffer.
 * Gemini TTS returns raw 16-bit PCM at 24kHz Mono.
 */
function addWavHeader(pcmBuffer: Buffer, sampleRate: number = 24000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // AudioFormat: 1 (PCM)
  header.writeUInt16LE(1, 22); // NumChannels: 1 (Mono)
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Gemini Text-to-Speech (TTS) Generation
 * Supports both single-speaker and multi-speaker modes using the official SDK.
 * Implements retry logic as recommended by documentation for transient 500 errors.
 */
export async function generateTTS(options: TTSOptions, retries = 3): Promise<TTSResult> {
  const { text, voice = 'Zephyr', multiSpeaker } = options;
  const model = 'gemini-3.1-flash-tts-preview';

  for (let i = 0; i < retries; i++) {
    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      const config: any = {
        responseModalities: ['AUDIO'],
      };

      if (multiSpeaker && multiSpeaker.speakers.length > 0) {
        config.speechConfig = {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: multiSpeaker.speakers.map((s) => ({
              speaker: s.name,
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: s.voice },
              },
            })),
          },
        };
      } else {
        config.speechConfig = {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        };
      }

      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text }] }],
        config,
      });

      const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!data) {
        // Check for common reasons for missing data (e.g. content blocking)
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason === 'SAFETY') {
          throw new Error('TTS generation failed due to safety filters.');
        }
        throw new Error('No audio data returned from Gemini TTS');
      }

      const pcmBuffer = Buffer.from(data, 'base64');
      const wavBuffer = addWavHeader(pcmBuffer);

      return { success: true, buffer: wavBuffer };
    } catch (error: any) {
      console.error(`[GENERATE_TTS_ATTEMPT_${i + 1}_FAILED]`, error.message);

      // If it's the last attempt, or if it's not a transient error, throw/return error
      if (i === retries - 1) {
        return { success: false, error: error.message };
      }

      // Wait a bit before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }

  return { success: false, error: 'Maximum retries reached' };
}
