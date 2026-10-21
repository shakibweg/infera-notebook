import { ApifyClient } from 'apify-client';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { APIFY_API_TOKEN } from '@/lib/env';

/**
 * Interface representing an item returned by codepoetry/youtube-transcript-ai-scraper.
 */
interface ApifyYoutubeItem {
  metadata?: {
    id?: string;
    title?: string;
    url?: string;
    description?: string;
    duration?: number;
    view_count?: number;
    like_count?: number;
    channel?: string;
    channel_id?: string;
    channel_url?: string;
    thumbnail?: string;
    upload_date?: string;
    tags?: string[];
    categories?: string[];
  };
  language?: string;
  is_auto_generated?: boolean;
  is_ai_generated?: boolean;
  is_language_fallback?: boolean;
  is_machine_translated?: boolean;
  translated_from?: string;
  requested_languages?: string[];
  transcript_json?: Array<{
    start: number;
    end?: number;
    text: string;
    words?: Array<{ start: number; end: number; text: string }>;
  }>;
  transcript_text?: string;
  transcript_llm?: string;
  transcript_srt?: string;
  transcript_vtt?: string;
  error_code?: string;
  error?: string;
  retryable?: string;
}

/**
 * Formats a duration or timestamp in seconds into HH:MM:SS or MM:SS format.
 */
function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

interface TranscriptChunk {
  text: string;
  start: number;
  end: number;
  timestamp: string;
}

/**
 * Groups fine-grained transcript segments into cohesive chunks with timestamps.
 * This preserves exact timestamp markers while ensuring chunks have enough semantic context for RAG.
 */
function chunkTranscriptSegments(
  segments: Array<{ start: number; end?: number; text: string }>,
  targetChars = 1400,
  maxWindowSec = 90
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let currentLines: string[] = [];
  let currentLength = 0;
  let chunkStart = segments[0]?.start ?? 0;
  let chunkEnd = segments[0]?.end ?? chunkStart;

  for (const seg of segments) {
    const cleanText = (seg.text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) continue;

    const timePrefix = `[${formatTimestamp(seg.start)}]`;
    const line = `${timePrefix} ${cleanText}`;
    const segEnd = seg.end ?? seg.start;

    if (
      currentLines.length > 0 &&
      (currentLength + line.length > targetChars || seg.start - chunkStart > maxWindowSec)
    ) {
      chunks.push({
        text: currentLines.join(' '),
        start: chunkStart,
        end: chunkEnd,
        timestamp: formatTimestamp(chunkStart),
      });
      currentLines = [];
      currentLength = 0;
      chunkStart = seg.start;
    }

    if (currentLines.length === 0) {
      chunkStart = seg.start;
    }

    currentLines.push(line);
    currentLength += line.length + 1;
    chunkEnd = segEnd;
  }

  if (currentLines.length > 0) {
    chunks.push({
      text: currentLines.join(' '),
      start: chunkStart,
      end: chunkEnd,
      timestamp: formatTimestamp(chunkStart),
    });
  }

  return chunks;
}

/**
 * Converts a YouTube video to vectorizable Documents using Apify's
 * codepoetry/youtube-transcript-ai-scraper Actor.
 *
 * Capabilities:
 * - Extracts native subtitles (both manual and auto-generated).
 * - Automatic AI Speech-to-Text transcription fallback when no captions exist.
 * - Multi-language support and automatic translation fallback.
 * - Enriched metadata including video title, channel, duration, and accurate timestamps.
 * - Handles single videos, playlists, channels, and Shorts.
 *
 * @param url - The YouTube video URL.
 * @returns Array of LangChain Documents ready for vector store ingestion.
 */
export async function youtubeToVector(url: string): Promise<Document[]> {
  try {
    const token = APIFY_API_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
    if (!token) {
      throw new Error(
        'APIFY_API_TOKEN is not configured in the environment variables. Please add it to your .env file.'
      );
    }

    const client = new ApifyClient({ token });

    const input = {
      startUrls: [{ url }],
      languages: ['en'],
      subType: 'both',
      outputFormats: ['json', 'text', 'llm', 'srt'],
      enableAiFallback: true,
      useAnyAvailableCaptionLanguage: true,
      maxAiMinutes: 60,
      skipAiFallbackIfLongerThan: 0,
    };

    console.log(`[youtubeToVector] Triggering Apify YouTube scraper for: ${url}`);
    const run = await client.actor('codepoetry/youtube-transcript-ai-scraper').call(input);

    if (!run || !run.defaultDatasetId) {
      throw new Error('Apify actor run did not return a valid dataset ID');
    }

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      throw new Error(`No data returned from YouTube transcript scraper for URL: ${url}`);
    }

    const typedItems = items as unknown as ApifyYoutubeItem[];
    const validItems = typedItems.filter((item) => !item.error_code);

    if (validItems.length === 0) {
      const firstError = typedItems[0];
      throw new Error(
        `YouTube transcription failed [${firstError.error_code || 'UNKNOWN_ERROR'}]: ${firstError.error || 'Unable to extract transcript from video'}`
      );
    }

    const allDocuments: Document[] = [];

    for (const item of validItems) {
      const videoTitle = item.metadata?.title || 'YouTube Video';
      const channel = item.metadata?.channel || '';
      const duration = item.metadata?.duration;
      const formattedDuration = duration ? formatTimestamp(duration) : undefined;
      const description = item.metadata?.description || '';
      const videoUrl = item.metadata?.url || url;
      const language = item.language || 'en';
      const isAiGenerated = Boolean(item.is_ai_generated);

      // Prepend an informational overview document for context
      const summaryLines = [
        videoTitle ? `Title: ${videoTitle}` : '',
        channel ? `Channel: ${channel}` : '',
        formattedDuration ? `Duration: ${formattedDuration} (${duration}s)` : '',
        language ? `Language: ${language}` : '',
        isAiGenerated
          ? 'Captions Source: AI Speech-to-Text Transcription'
          : 'Captions Source: YouTube Captions',
        description ? `\nDescription:\n${description}` : '',
      ].filter(Boolean);

      const summaryDoc = new Document({
        pageContent: `[YouTube Video Summary & Details]\n${summaryLines.join('\n')}`,
        metadata: {
          source: videoUrl,
          type: 'youtube',
          title: videoTitle,
          channel,
          duration,
          language,
          isSummary: true,
        },
      });

      const videoDocuments: Document[] = [summaryDoc];

      // Prefer timestamped JSON segments if available
      if (item.transcript_json && item.transcript_json.length > 0) {
        const chunks = chunkTranscriptSegments(item.transcript_json);

        chunks.forEach((chunk, index) => {
          videoDocuments.push(
            new Document({
              pageContent: chunk.text,
              metadata: {
                source: videoUrl,
                type: 'youtube',
                title: videoTitle,
                channel,
                duration,
                timestamp: chunk.timestamp,
                start: chunk.start,
                end: chunk.end,
                language,
                isAiGenerated,
                segmentIndex: index,
              },
            })
          );
        });
      } else {
        // Fallback to plain text or LLM transcript if JSON segments were omitted for long videos
        const rawContent = item.transcript_llm || item.transcript_text || '';
        if (rawContent.trim().length > 0) {
          const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1500,
            chunkOverlap: 150,
          });

          const splitDocs = await splitter.createDocuments([rawContent]);
          splitDocs.forEach((doc, index) => {
            videoDocuments.push(
              new Document({
                pageContent: doc.pageContent,
                metadata: {
                  source: videoUrl,
                  type: 'youtube',
                  title: videoTitle,
                  channel,
                  duration,
                  language,
                  isAiGenerated,
                  segmentIndex: index,
                },
              })
            );
          });
        }
      }

      allDocuments.push(...videoDocuments);
    }

    if (allDocuments.length === 0) {
      throw new Error(`Failed to extract any readable transcript content from: ${url}`);
    }

    return allDocuments;
  } catch (error) {
    console.error('[youtubeToVector] Error:', error);
    throw new Error(
      `Failed to convert YouTube to vector: ${error instanceof Error ? error.message : error}`
    );
  }
}
