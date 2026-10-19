/**
 * Represents a basic text or markdown note saved from a chat conversation.
 */
export type CHAT_NOTE_TYPE = {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Represents the structure of a Mind Map note.
 * Content is a recursive tree structure suitable for rendering nodes and junctions.
 */
export type MIND_MAP_NOTE_TYPE = {
  id: string;
  title: string;
  content: {
    id: string;
    label: string;
    expanded: boolean;
    children: Array<MIND_MAP_NOTE_TYPE['content']>;
  };
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Represents an Audio Overview note.
 * Contains both the generated audio file metadata and the transcript segments.
 */
export type AUDIO_OVERVIEW_NOTE_TYPE = {
  id: string;
  title: string;
  content: {
    /** Persistence path for deletion or updates */
    path: string;
    /** Individual segments of the script with speaker labels */
    segments: Array<{
      content: string;
      voice: string;
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Represents a Video Overview note.
 * A complex type combining audio, captions, and AI-generated imagery.
 */
export type VIDEO_OVERVIEW_NOTE_TYPE = {
  id: string;
  title: string;
  content: {
    path: string;
    captions: Array<any>;
    /** Images generated for each scene in the video */
    images: Array<{
      path: string;
      sceneContent: string;
    }>;
    /** The raw LLM script used to orchestrate generation */
    videoScript: string;
  };
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Represents an FAQ (Frequently Asked Questions) note.
 */
export type FAQ_NOTE_TYPE = {
  id: string;
  title: string;
  content: Array<{
    question: string;
    answer: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Represents a Timeline note, organizing events chronologically.
 */
export type TIMELINE_NOTE_TYPE = {
  id: string;
  title: string;
  content: Array<{
    /** Human-readable time or date string */
    time: string;
    /** Description of the event */
    content: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

export type BRIEFING_DOC_NOTE_TYPE = {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Represents a Slide Deck note.
 * Each entry maps a slide title to its pre-rendered slide image.
 */
export type SLIDE_DECK_NOTE_TYPE = {
  id: string;
  title: string;
  content: Array<{
    title: string;
    path: string; // slide image path
  }>;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Detailed image metadata for infographics.
 */
export type InfographicImageNoteType = {
  path: string; // Cloudflare R2 key
  prompt: string; // Prompt used to generate the image
  width: number; // Image width in pixels
  height: number; // Image height in pixels
  /** Technical model identifier (e.g., flux-schnell) */
  model: string;
};

/**
 * Represents an Infographic note.
 */
export type INFOGRAPHIC_NOTE_TYPE = {
  id: string;
  title: string;
  content: InfographicImageNoteType;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Represents a Quiz note with multiple choice questions.
 */
export type QUIZ_NOTE_TYPE = {
  id: string;
  title: string;
  content: Array<{
    question: string;
    options: Array<{
      option: string;
      isCorrect: boolean;
    }>;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Represents a Flash Cards note.
 */
export type FLASH_CARDS_NOTE_TYPE = {
  id: string;
  title: string;
  content: Array<{
    front: string;
    back: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
};
