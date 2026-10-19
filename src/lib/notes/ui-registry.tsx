/**
 * Note UI Registry
 * This file manages the client-side representation and rendering of different note types.
 * it defines the icons, labels, and React components used to display notes in the UI.
 */

'use client';

import React from 'react';
// Import icons for different note types
import {
  BarChart3,
  Brain,
  Clock,
  Edit,
  File,
  FileAudio,
  HelpCircle,
  Layers3,
  Presentation,
  Sparkles,
  Video,
} from 'lucide-react';

import { AllowedNoteType } from '@/generated/prisma/enums';
import type { SelectedNote } from '@/hooks/useSelectedNote';

// Import specific view components for each note type
import { FaqNoteView } from '@/components/notes/faq/faq-note-view';
import { MindmapNoteView } from '@/components/notes/mindmap/mindmap-note-view';
import { TimelineNoteView } from '@/components/notes/timeline/timeline-note-view';
import { BriefingNoteView } from '@/components/notes/briefing/briefing-note-view';
import { QuizNoteView } from '@/components/notes/quiz/quiz-note-view';
import { FlashCardsNoteView } from '@/components/notes/flash-cards/flash-cards-note-view';
import { InfographicNoteView } from '@/components/notes/infographic/infographic-note-view';
import { SlideDeckNoteView } from '@/components/notes/slide-deck/slide-deck-note-view';
import { AudioOverviewNoteView } from '@/components/notes/audio-overview/audio-overview-note-view';
import { VideoOverviewNoteView } from '@/components/notes/video-overview/video-overview-note-view';
import { EditableNoteView } from '@/components/notes/editable-note/editable-note-view';
import { ChatNoteView } from '@/components/notes/chat-note/chat-note-view';

// Alias for SelectedNote type used throughout the UI
export type Note = SelectedNote;

/**
 * Definition for a note type option in the UI (e.g., in the 'Create Note' menu)
 */
export type NoteTypeOption = {
  type: AllowedNoteType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  beta?: boolean;
  disabled?: boolean;
};

/**
 * List of available note types displayed in the application with their respective UI metadata
 */
export const noteNodes: NoteTypeOption[] = [
  {
    type: AllowedNoteType.AUDIO_OVERVIEW,
    label: 'Audio Overview',
    description: 'Generate an audio summary from your sources.',
    icon: FileAudio,
  },
  {
    type: AllowedNoteType.VIDEO_OVERVIEW,
    label: 'Video Overview',
    description: 'Create a short video-style overview of the content.',
    icon: Video,
  },
  {
    type: AllowedNoteType.MIND_MAP,
    label: 'Mindmap',
    description: 'Visual mindmap of the key ideas.',
    icon: Brain,
  },
  {
    type: AllowedNoteType.FAQ,
    label: 'FAQ',
    description: 'Common questions and answers.',
    icon: HelpCircle,
  },
  {
    type: AllowedNoteType.TIMELINE,
    label: 'Timeline',
    description: 'Chronological breakdown of events.',
    icon: Clock,
  },
  {
    type: AllowedNoteType.BRIEFING_DOC,
    label: 'Briefing Doc',
    description: 'Concise written briefing.',
    icon: File,
  },
  {
    type: AllowedNoteType.SLIDE_DECK,
    label: 'Slide Deck',
    description: 'Slide-style summary of the material.',
    icon: Presentation,
    beta: true,
    disabled: true,
  },
  {
    type: AllowedNoteType.INFOGRAPHIC,
    label: 'Infographic',
    description: 'Visual infographic of key points.',
    icon: BarChart3,
    beta: true,
    disabled: true,
  },
  {
    type: AllowedNoteType.QUIZ,
    label: 'Quiz',
    description: 'Questions to test understanding.',
    icon: Sparkles,
  },
  {
    type: AllowedNoteType.FLASH_CARDS,
    label: 'Flash Cards',
    description: 'Flash cards for spaced repetition.',
    icon: Layers3,
  },
  {
    type: AllowedNoteType.EDITABLE_NOTE,
    label: 'Note',
    description: 'Simple editable note.',
    icon: Edit,
  },
];

/**
 * Common prop structure for all Note View components
 */
export type NoteContentComponent = React.ComponentType<{
  note: Note;
  notebookId?: string;
  onClose?: () => void;
  onInteractiveMode?: () => void;
}>;

/**
 * Default fallback view if a specific component is not found or content is missing
 */
export const DefaultNoteView: NoteContentComponent = ({ note, notebookId }) => (
  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
    {note.content || 'No content available yet.'}
  </div>
);

/**
 * Utility to wrap note view components and ensure they follow the standard prop signature
 * @param Component - The React component to wrap
 */
const wrapNoteView = (
  Component: React.ComponentType<{ note: SelectedNote; [key: string]: any }>
): NoteContentComponent => {
  return ({ note, notebookId, onClose, onInteractiveMode }) => (
    <Component
      note={note}
      notebookId={notebookId}
      onClose={onClose}
      onInteractiveMode={onInteractiveMode}
    />
  );
};

/**
 * Note Content Registry
 * Maps each 'AllowedNoteType' to its corresponding React component for rendering.
 * Used by the NoteDetail component to switch between different visualization styles.
 */
export const noteContentRegistry: Record<AllowedNoteType, NoteContentComponent> = {
  [AllowedNoteType.FAQ]: wrapNoteView(FaqNoteView),
  [AllowedNoteType.MIND_MAP]: wrapNoteView(MindmapNoteView),
  [AllowedNoteType.CHAT_NOTE]: ChatNoteView,
  [AllowedNoteType.EDITABLE_NOTE]: EditableNoteView,
  [AllowedNoteType.AUDIO_OVERVIEW]: wrapNoteView(AudioOverviewNoteView),
  [AllowedNoteType.VIDEO_OVERVIEW]: wrapNoteView(VideoOverviewNoteView),
  [AllowedNoteType.TIMELINE]: wrapNoteView(TimelineNoteView),
  [AllowedNoteType.BRIEFING_DOC]: wrapNoteView(BriefingNoteView),
  [AllowedNoteType.SLIDE_DECK]: wrapNoteView(SlideDeckNoteView),
  [AllowedNoteType.INFOGRAPHIC]: wrapNoteView(InfographicNoteView),
  [AllowedNoteType.QUIZ]: wrapNoteView(QuizNoteView),
  [AllowedNoteType.FLASH_CARDS]: wrapNoteView(FlashCardsNoteView),
};
