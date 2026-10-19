import { AllowedSourceType } from '@/generated/prisma/enums';
import type { SourceVectorizer } from './utils';

import { pdfToVector } from './pdfToVector';
import { csvToVector } from './csvToVector';
import { youtubeToVector } from './youtubeToVector';
import { websiteToVector } from './websiteToVector';
import { audioToVector } from './audioToVector';
import { githubToVector } from './githubToVector';
import { jsonToVector } from './jsonToVector';
import { jsonLinesToVector } from './jsonLinesToVector';
import { txtToVector } from './txtToVector';
import { docxToVector } from './docxToVector';
import { epubToVector } from './epubToVector';
import { pptxToVector } from './pptxToVector';
import { srtToVector } from './srtToVector';

/**
 * Source Vectorizer Registry
 * Maps source types to their respective vectorization methods.
 */
export const sourceVectorizers: Record<AllowedSourceType, SourceVectorizer> = {
  APPLICATION_PDF: pdfToVector,
  CSV: csvToVector,
  YOUTUBE: youtubeToVector,
  WEBSITE: websiteToVector,
  VIDEO_MP4: audioToVector,
  VIDEO_WEBM: audioToVector,
  AUDIO_MP3: audioToVector,
  AUDIO_M4A: audioToVector,
  GITHUB: githubToVector,
  JSON: jsonToVector,
  JSONLINES: jsonLinesToVector,
  TEXT: txtToVector,
  DOCX: docxToVector,
  EPUB: epubToVector,
  PPTX: pptxToVector,
  SUBTITLES: srtToVector,
};
