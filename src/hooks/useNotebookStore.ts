import { create } from 'zustand';
import { AllowedSourceType, Status } from '@/generated/prisma/enums';

export type SourceStatus = Status;

export interface Source {
  id: string;
  sourceTitle: string;
  type: AllowedSourceType;
  fileId: string;
  file: {
    path: string;
    contentType: string;
  };
  status: SourceStatus;
}

export interface Notebook {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zustand store for managing the application's global notebook state.
 * Orchestrates notebooks, sources, selection state, and user credits.
 */
interface NotebookStore {
  /** Array of all notebooks available to the user */
  notebooks: Notebook[];
  setNotebooks: (notebooks: Notebook[]) => void;
  /** Array of sources associated with the active notebook */
  sources: Source[];
  setSources: (sources: Source[]) => void;
  addSource: (source: Source) => void;
  updateSource: (sourceId: string, updates: Partial<Source>) => void;
  removeSource: (sourceId: string) => void;
  /** List of UUIDs for sources currently selected in the sidebar */
  selectedSourceIds: string[];
  setSelectedSourceIds: (ids: string[]) => void;
  toggleSourceSelection: (sourceId: string, checked: boolean) => void;
  selectAllSources: (checked: boolean) => void;
  /** The currently active notebook object */
  currentNotebook: Notebook | null;
  setCurrentNotebook: (notebook: Notebook | null) => void;
  /** User's available credits for AI operations */
  credits: number;
  setCredits: (credits: number) => void;
  /** Async action to refresh the user's credit balance from the server */
  fetchCredits: () => Promise<void>;
}

export const useNotebookStore = create<NotebookStore>((set) => ({
  notebooks: [],
  setNotebooks: (notebooks) => set({ notebooks }),
  sources: [],
  setSources: (sources) => set({ sources }),
  addSource: (source) => set((state) => ({ sources: [source, ...state.sources] })),
  updateSource: (sourceId, updates) =>
    set((state) => ({
      sources: state.sources.map((s) => (s.id === sourceId ? { ...s, ...updates } : s)),
    })),
  removeSource: (sourceId) =>
    set((state) => ({
      sources: state.sources.filter((s) => s.id !== sourceId),
      selectedSourceIds: state.selectedSourceIds.filter((id) => id !== sourceId),
    })),
  selectedSourceIds: [],
  setSelectedSourceIds: (ids) => set({ selectedSourceIds: ids }),
  toggleSourceSelection: (sourceId, checked) =>
    set((state) => ({
      selectedSourceIds: checked
        ? [...state.selectedSourceIds, sourceId]
        : state.selectedSourceIds.filter((id) => id !== sourceId),
    })),
  selectAllSources: (checked) =>
    set((state) => ({
      selectedSourceIds: checked ? state.sources.map((s) => s.id) : [],
    })),
  currentNotebook: null,
  setCurrentNotebook: (notebook) => set({ currentNotebook: notebook }),
  credits: 0,
  setCredits: (credits) => set({ credits }),
  fetchCredits: async () => {
    try {
      const res = await fetch('/api/user/credits');
      const data = await res.json();
      if (typeof data.credits === 'number') {
        set({ credits: data.credits });
      }
    } catch (error) {
      console.error('Failed to fetch credits:', error);
    }
  },
}));
