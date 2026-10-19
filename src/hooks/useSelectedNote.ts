import { useState } from 'react';
import type { AllowedNoteType, Status } from '@/generated/prisma/enums';

export interface SelectedNote {
  id: string;
  noteTitle: string;
  type: AllowedNoteType;
  status: Status;
  createdAt: Date;
  content?: string;
  sources?: { id: string }[];
}

/**
 * Simple hook to manage the state of the currently selected/active note.
 * Used for orchestration between the NotesPanel and the NoteViewer (Chat note, Quiz, etc.).
 */
export function useSelectedNote() {
  const [selectedNote, setSelectedNote] = useState<SelectedNote | null>(null);
  /** Helper to check if a valid note is currently being viewed. */
  const isNoteSelected = !!selectedNote;

  return { selectedNote, setSelectedNote, isNoteSelected };
}
