/* UI-only scaffold for sources panel */
'use client';

import { useCallback, useEffect, useMemo, useState, useRef, type DragEvent } from 'react';
import { Icon } from '@iconify/react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  Github,
  Globe,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  allowedSourceTypes,
  isAllowedSourceType,
  MAX_LINK_TITLE_LENGTH,
  MAX_PASTE_TITLE_LENGTH,
} from '@/lib/constants';
import { AllowedSourceType, Status } from '@/generated/prisma/enums';
import { cn } from '@/lib/utils';
import { useNotebookStore, type Source, type SourceStatus } from '@/hooks/use-notebook-store';
import { useInngestSubscription } from '@inngest/realtime/hooks';
import { fetchNotebookRealtimeSubscriptionToken } from '@/inngest/realtime';

// Re-export Source type for local use
type LocalSource = Source;

type IncomingSource = {
  id?: string;
  sourceTitle?: string;
  type?: string;
  fileId?: string;
  file?: {
    path: string;
    contentType: string;
  };
  status?: SourceStatus | 'COMPLETED' | string;
};

/**
 * Official YouTube Icon component with authentic brand styling (#FF0000 red badge with white play triangle).
 */
function YouTubeIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
        fill="#FF0000"
      />
      <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FFFFFF" />
    </svg>
  );
}

interface SourcePanelProps {
  className?: string;
  notebookId?: string | string[];
}

/**
 * SourcePanel component.
 * Handles the ingestion and management of various source materials for a notebook.
 * Features:
 * - File upload to Cloudinary with automatic type mapping.
 * - Link submission (YouTube, GitHub, Websites).
 * - Text pasting.
 * - AI-powered source discovery.
 * - Real-time processing status updates.
 * - Optimistic UI updates for creation and deletion.
 */
export function SourcePanel({ className = '', notebookId }: SourcePanelProps) {
  // Zustand store
  const {
    sources,
    setSources,
    addSource,
    updateSource,
    removeSource,
    selectedSourceIds,
    setSelectedSourceIds,
    toggleSourceSelection,
    selectAllSources,
  } = useNotebookStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [addSourceMode, setAddSourceMode] = useState<
    'default' | 'website' | 'youtube' | 'text' | 'discover'
  >('default');
  const [discoverModalOpen, setDiscoverModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editingSource, setEditingSource] = useState<LocalSource | null>(null);
  const [url, setUrl] = useState('');
  const [copiedText, setCopiedText] = useState('');
  const [discoverInterest, setDiscoverInterest] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLinkSubmitting, setIsLinkSubmitting] = useState(false);
  const [isPasteSubmitting, setIsPasteSubmitting] = useState(false);
  const [isDeletingSourceId, setIsDeletingSourceId] = useState<string | null>(null);
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDialogDragOver, setIsDialogDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);

  const [discoveredSources, setDiscoveredSources] = useState<
    Array<{
      url: string;
      title: string;
      content: string;
      score?: number;
      raw_content?: string | null;
      favicon: string;
    }>
  >([]);

  const [selectedDiscoveredSources, setSelectedDiscoveredSources] = useState<number[]>([]);
  const [selectAllDiscovered, setSelectAllDiscovered] = useState(false);

  const resolvedNotebookId = useMemo(
    () =>
      typeof notebookId === 'string' ? notebookId : Array.isArray(notebookId) ? notebookId[0] : '',
    [notebookId]
  );

  // Realtime subscription for source status updates
  const { latestData: latestSourceStatus } = useInngestSubscription({
    refreshToken: async () => {
      if (!resolvedNotebookId) {
        throw new Error('No notebook selected');
      }
      return await fetchNotebookRealtimeSubscriptionToken(resolvedNotebookId);
    },
  });

  useEffect(() => {
    if (!latestSourceStatus) return;

    const messages = Array.isArray(latestSourceStatus) ? latestSourceStatus : [latestSourceStatus];

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || (lastMessage as any).topic !== 'source-status') return;

    const { sourceId, status, sourceTitle } = (lastMessage as any).data as {
      sourceId?: string;
      status?: SourceStatus;
      sourceTitle?: string;
    };
    if (!sourceId || !status) return;

    updateSource(sourceId, { status, ...(sourceTitle ? { sourceTitle } : {}) });
  }, [latestSourceStatus, updateSource]);

  const handleSelectAllSources = (checked: boolean) => {
    selectAllSources(checked);
  };

  const handleSelectSource = (sourceId: string, checked: boolean) => {
    toggleSourceSelection(sourceId, checked);
  };

  const isYouTubeUrl = (value: string) =>
    value.includes('youtube.com') || value.includes('youtu.be');

  const isGithubUrl = (value: string) =>
    value.includes('github.com') || value.includes('git@github.com');

  const determineLinkType = (value: string): AllowedSourceType => {
    if (isYouTubeUrl(value)) return 'YOUTUBE';
    if (isGithubUrl(value)) return 'GITHUB';
    return 'WEBSITE';
  };

  const mapMimeOrExtensionToAllowedType = (file: File): AllowedSourceType | null => {
    const mime = (file.type || '').toLowerCase();
    const name = file.name.toLowerCase();

    if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'APPLICATION_PDF';
    if (mime === 'text/csv' || name.endsWith('.csv')) return 'CSV';
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx')
    )
      return 'DOCX';
    if (
      mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      name.endsWith('.pptx')
    )
      return 'PPTX';
    if (mime === 'application/epub+zip' || name.endsWith('.epub')) return 'EPUB';
    if (mime === 'audio/mpeg' || mime === 'audio/mp3' || name.endsWith('.mp3')) return 'AUDIO_MP3';
    if (mime === 'audio/mp4' || mime === 'audio/m4a' || name.endsWith('.m4a')) return 'AUDIO_M4A';
    if (mime === 'video/mp4' || name.endsWith('.mp4')) return 'VIDEO_MP4';
    if (mime === 'video/webm' || name.endsWith('.webm')) return 'VIDEO_WEBM';
    if (mime === 'application/json' || name.endsWith('.json') || mime === 'application/ld+json')
      return 'JSON';
    if (name.endsWith('.jsonl') || name.endsWith('.jsonlines')) return 'JSONLINES';
    if (name.endsWith('.vtt') || name.endsWith('.srt')) return 'SUBTITLES';
    if (
      mime === 'text/plain' ||
      mime === 'text/markdown' ||
      name.endsWith('.txt') ||
      name.endsWith('.md')
    )
      return 'TEXT';

    return null;
  };

  /**
   * Processes a URL submission.
   * Determines the link type (YouTube, GitHub, or generic Website) and adds it to the notebook.
   */
  const handleLinkSubmit = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    if (!resolvedNotebookId) {
      setError('No notebook selected.');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmedUrl);
    } catch {
      setError('Please enter a valid URL.');
      return;
    }

    const linkType = determineLinkType(trimmedUrl);
    let titleFallback = trimmedUrl;

    if (linkType === 'GITHUB') {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        titleFallback = `${pathParts[0]}/${pathParts[1]}`;
      }
    }

    const finalTitle =
      linkType !== 'YOUTUBE' && titleFallback.length > MAX_LINK_TITLE_LENGTH
        ? `${titleFallback.slice(0, MAX_LINK_TITLE_LENGTH)}...`
        : titleFallback;

    setIsLinkSubmitting(true);
    setError(null);
    setModalOpen(false); // Close dialog immediately
    setAddSourceMode('default');

    try {
      const response = await fetch(`/api/notebooks/${resolvedNotebookId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTitle: finalTitle,
          type: linkType,
          file: {
            path: trimmedUrl,
            contentType: 'text/x-uri',
          },
          status: Status.PROCESSING,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add link');
      }

      const data = await response.json();
      const normalized = normalizeSource(data.source);
      if (normalized) {
        // Ensure status is PROCESSING for optimistic update
        const sourceWithProcessingStatus: LocalSource = {
          ...normalized,
          status: Status.PROCESSING,
        };
        addSource(sourceWithProcessingStatus);
      }
      setUrl('');
    } catch (err) {
      console.error(err);
      setError('Failed to add link. Please try again.');
    } finally {
      setIsLinkSubmitting(false);
    }
  };

  const deriveTitleFromText = (text: string) => {
    const condensed = text.replace(/\s+/g, ' ').trim();
    if (!condensed) return 'Pasted Text';
    return condensed.length > MAX_PASTE_TITLE_LENGTH
      ? `${condensed.slice(0, MAX_PASTE_TITLE_LENGTH)}...`
      : condensed;
  };

  const handlePasteSubmit = async () => {
    const trimmed = copiedText.trim();
    if (!trimmed) return;

    if (!resolvedNotebookId) {
      setError('No notebook selected.');
      return;
    }

    setIsPasteSubmitting(true);
    setError(null);
    setModalOpen(false); // Close dialog immediately
    setAddSourceMode('default');

    try {
      // Create a text file blob to reuse the existing upload helper
      const textFile = new File([trimmed], `pasted-${Date.now()}.txt`, {
        type: 'text/plain',
      });

      const uploaded = await uploadFileToS3(textFile, uploadAbortControllerRef.current?.signal);

      const response = await fetch(`/api/notebooks/${resolvedNotebookId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTitle: deriveTitleFromText(trimmed),
          type: 'TEXT' as AllowedSourceType,
          file: {
            path: uploaded.key,
            contentType: 'text/plain',
          },
          status: Status.PROCESSING,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add pasted text');
      }

      const data = await response.json();
      const normalized = normalizeSource(data.source);
      if (normalized) {
        // Ensure status is PROCESSING for optimistic update
        const sourceWithProcessingStatus: LocalSource = {
          ...normalized,
          status: Status.PROCESSING,
        };
        addSource(sourceWithProcessingStatus);
      }

      setCopiedText('');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setError('Upload cancelled.');
      } else {
        console.error(err);
        setError('Failed to add pasted text. Please try again.');
      }
    } finally {
      setIsPasteSubmitting(false);
    }
  };

  const getFileIcon = (source: Source) => {
    const urlVal = (source.file?.path || '').toLowerCase();

    switch (source.type) {
      case 'AUDIO_MP3':
      case 'AUDIO_M4A':
        return <Icon icon="mdi:volume-high" className="w-4 h-4 text-muted-foreground" />;
      case 'VIDEO_MP4':
      case 'VIDEO_WEBM':
        return <Icon icon="mdi:video-outline" className="w-4 h-4 text-muted-foreground" />;
      case 'APPLICATION_PDF':
      case 'CSV':
      case 'TEXT':
      case 'DOCX':
      case 'EPUB':
      case 'PPTX':
      case 'JSON':
      case 'JSONLINES':
      case 'SUBTITLES':
        return <Icon icon="mdi:file-document-outline" className="w-4 h-4 text-muted-foreground" />;
      case 'YOUTUBE':
        return <YouTubeIcon className="w-4 h-4" />;
      case 'WEBSITE':
        return <Icon icon="mdi:web" className="w-4 h-4 text-muted-foreground" />;
      case 'GITHUB':
        return <Icon icon="mdi:github" className="w-4 h-4 text-muted-foreground" />;
      default:
        if (urlVal.includes('youtube.com') || urlVal.includes('youtu.be')) {
          return <YouTubeIcon className="w-4 h-4" />;
        }
        if (urlVal.includes('github.com')) {
          return <Icon icon="mdi:github" className="w-4 h-4 text-muted-foreground" />;
        }
        if (urlVal.endsWith('.mp4') || urlVal.endsWith('.webm')) {
          return <Icon icon="mdi:video-outline" className="w-4 h-4 text-muted-foreground" />;
        }
        if (urlVal.startsWith('http')) {
          return <Icon icon="mdi:web" className="w-4 h-4 text-muted-foreground" />;
        }
        return <Icon icon="mdi:file-document-outline" className="w-4 h-4 text-muted-foreground" />;
    }
  };

  /**
   * Interacts with the discovery API to find relevant sources based on user interest.
   */
  const handleDiscoverSubmit = async () => {
    if (!discoverInterest.trim()) return;

    setIsDiscovering(true);
    try {
      const response = await fetch('/api/sources/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: discoverInterest }),
      });

      if (!response.ok) {
        throw new Error('Failed to discover sources');
      }

      const data = await response.json();
      if (data && data.results) {
        setDiscoveredSources(data.results);
      }
    } catch (err) {
      console.error('Error discovering sources:', err);
      toast.error('Internal Server Error');
      setError('Failed to discover sources. Please try again.');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleImportSelected = async () => {
    if (!resolvedNotebookId) {
      setError('No notebook selected.');
      return;
    }

    const selectedSources = selectedDiscoveredSources.map((index) => discoveredSources[index]);

    if (selectedSources.length === 0) {
      setError('Please select sources to import.');
      return;
    }

    setIsImporting(true);
    setError(null);

    // Get the sources to import before clearing the selection
    const sourcesToImport = [...selectedSources];

    // Close the discovery modal and clear state immediately for better UX
    setDiscoverModalOpen(false);
    setModalOpen(false);
    setAddSourceMode('default');
    setSelectedDiscoveredSources([]);
    setSelectAllDiscovered(false);
    setDiscoveredSources([]);
    setDiscoverInterest('');

    try {
      const importedSources: Source[] = [];
      for (const source of sourcesToImport) {
        try {
          const lowerUrl = source.url.toLowerCase();
          const inferredType: AllowedSourceType = lowerUrl.endsWith('.pdf')
            ? 'APPLICATION_PDF'
            : isGithubUrl(source.url)
              ? 'GITHUB'
              : 'WEBSITE';

          const response = await fetch(`/api/notebooks/${resolvedNotebookId}/sources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceTitle: source.title,
              type: inferredType,
              file: {
                path: source.url,
                contentType: 'text/x-uri',
              },
              status: Status.PROCESSING,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const normalized = normalizeSource(data.source);
            if (normalized) {
              // Ensure status is PROCESSING for optimistic update
              const sourceWithProcessingStatus: LocalSource = {
                ...normalized,
                status: Status.PROCESSING,
              };
              importedSources.push(sourceWithProcessingStatus);
            }
          }
        } catch (innerErr) {
          console.error(innerErr);
          setError('Failed to import one or more sources.');
        }
      }

      // Optimistically add imported sources to the list
      if (importedSources.length > 0) {
        importedSources.forEach((source) => addSource(source));
      }
    } catch (err) {
      console.error('Error importing sources:', err);
      setError('Failed to import sources.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveEdit = () => {
    if (!editingSource || !editTitle.trim()) return;
    const trimmed = editTitle.trim();

    // Store the previous title for potential rollback
    const previousTitle = editingSource.sourceTitle;

    // Optimistically update the UI immediately
    updateSource(editingSource.id, { sourceTitle: trimmed });

    // Close the modal immediately
    setEditModalOpen(false);
    const sourceToEdit = editingSource;
    setEditingSource(null);
    setEditTitle('');

    setIsUpdatingTitle(true);

    // Make the API call in the background
    fetch(`/api/notebooks/${resolvedNotebookId}/sources/${sourceToEdit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceTitle: trimmed }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to update source title');
        }
        return res.json();
      })
      .catch((err) => {
        console.error(err);
        // Revert the optimistic update on error
        updateSource(sourceToEdit.id, { sourceTitle: previousTitle });
        setError('Failed to update source title.');
        toast.error('Failed to update source title. Please try again.');
      })
      .finally(() => {
        setIsUpdatingTitle(false);
      });
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!resolvedNotebookId) {
      setError('No notebook selected.');
      return;
    }

    // Find the source to delete for potential rollback
    const sourceToDelete = sources.find((s) => s.id === sourceId);
    if (!sourceToDelete) return;

    setIsDeletingSourceId(sourceId);
    setError(null);

    // Optimistically remove the source from the UI immediately
    removeSource(sourceId);

    try {
      const response = await fetch(`/api/notebooks/${resolvedNotebookId}/sources/${sourceId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete source');
      }
    } catch (err) {
      console.error(err);
      // Revert the optimistic update on error - restore the source
      addSource(sourceToDelete);
      toggleSourceSelection(sourceId, true);
      setError('Failed to delete source.');
      toast.error('Failed to delete source. Please try again.');
    } finally {
      setIsDeletingSourceId(null);
    }
  };

  const handleRetrySource = async (sourceId: string) => {
    if (!resolvedNotebookId) return;

    try {
      // Optimistically update status to PROCESSING
      updateSource(sourceId, { status: Status.PROCESSING });

      const response = await fetch(
        `/api/notebooks/${resolvedNotebookId}/sources/${sourceId}/retry`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to retry source');
      }

      toast.success('Retrying source processing...');
    } catch (err) {
      console.error(err);
      // Rollback status to FAILED on error
      updateSource(sourceId, { status: Status.FAILED });
      toast.error('Failed to retry source. Please try again.');
    }
  };

  /**
   * Client-side helper for uploading files directly to S3/R2.
   * Fetches a presigned URL then PUTs the file content.
   */
  const uploadFileToS3 = async (file: File, signal?: AbortSignal) => {
    // 1. Get the presigned URL and key from our API
    const res = await fetch('/api/s3/presigned-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentType: file.type,
        folder: 'sources',
      }),
      signal,
    });

    if (!res.ok) {
      throw new Error('Failed to get S3 upload URL');
    }

    const { uploadUrl, path } = await res.json();

    // 2. Perform the direct upload to S3 via PUT request
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
      signal,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text().catch(() => '');
      console.error('S3 upload failed:', uploadRes.status, uploadRes.statusText, errorText);
      throw new Error(
        `S3 upload failed (${uploadRes.status}: ${uploadRes.statusText || errorText || 'Upload error'})`
      );
    }

    return { key: path };
  };

  /**
   * Handles multi-stage file upload:
   * 1. Maps file type to an internal allowed type.
   * 2. Uploads the file to Cloudinary.
   * 3. Sends the Cloudinary URL to the backend to create a source.
   * 4. Updates the UI optimistically after the upload completes.
   */
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!resolvedNotebookId) {
      setError('No notebook selected.');
      return;
    }

    // Only allow single file upload
    const file = files[0];
    setIsUploading(true);
    setError(null);
    setModalOpen(false); // Close dialog immediately

    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;

    const uploadPromise = (async () => {
      const allowedType = mapMimeOrExtensionToAllowedType(file);
      if (!allowedType) {
        throw new Error(
          `Unsupported file type for ${file.name}. Allowed types: ${allowedSourceTypes.join(', ')}.`
        );
      }

      const uploaded = await uploadFileToS3(file, controller.signal);

      const response = await fetch(`/api/notebooks/${resolvedNotebookId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTitle: file.name,
          type: allowedType,
          file: {
            path: uploaded.key,
            contentType: file.type || 'application/octet-stream',
          },
          status: Status.PROCESSING,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to create source');
      }

      const data = await response.json();
      return data.source;
    })();

    const displayText = `Uploading ${file.name.slice(0, 20)}...`;

    try {
      // Show uploading toast - no optimistic update during upload
      const toastId = toast.loading(
        <div className="flex items-center w-full">
          <p className="flex-1 shrink-0 min-w-0">{displayText}</p>
        </div>
      );

      // Wait for upload to complete
      const createdSource = await uploadPromise;

      // Dismiss loading toast
      toast.dismiss(toastId);

      // Optimistically add the source with PROCESSING status after upload completes
      if (createdSource) {
        const normalized = normalizeSource(createdSource as IncomingSource);
        if (normalized) {
          // Ensure status is PROCESSING
          const sourceWithProcessingStatus: LocalSource = {
            ...normalized,
            status: Status.PROCESSING,
          };
          addSource(sourceWithProcessingStatus);
          toast.success('Upload complete. Processing sources...');
        }
      }
    } catch (err) {
      console.error('File upload error:', err);
      // If upload failed, show error and optionally refetch
      if ((err as Error).name === 'AbortError') {
        toast.error('Upload cancelled.');
      } else {
        toast.error((err as Error).message || 'Failed to upload file. Please try again.');
        // Fall back to refetching if needed
        await fetchSources();
      }
    } finally {
      uploadAbortControllerRef.current = null;
      setIsUploading(false);
      // allow re-uploading the same file name
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    // Don't handle drag if any modal is open
    if (modalOpen || discoverModalOpen || editModalOpen) {
      return;
    }
    if (event.dataTransfer?.types?.includes('Files')) {
      event.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    // Don't handle drag if any modal is open
    if (modalOpen || discoverModalOpen || editModalOpen) {
      return;
    }
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    // Don't handle drop if any modal is open
    if (modalOpen || discoverModalOpen || editModalOpen) {
      return;
    }
    if (!event.dataTransfer?.files?.length) {
      setIsDragOver(false);
      return;
    }
    event.preventDefault();
    setIsDragOver(false);
    handleFiles(event.dataTransfer.files);
  };

  const handleDialogDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer?.types?.includes('Files')) {
      event.preventDefault();
      setIsDialogDragOver(true);
    }
  };

  const handleDialogDragLeave = () => {
    setIsDialogDragOver(false);
  };

  const handleDialogDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.files?.length) {
      setIsDialogDragOver(false);
      return;
    }
    event.preventDefault();
    setIsDialogDragOver(false);
    handleFiles(event.dataTransfer.files);
  };

  const handleCancelUpload = () => {
    uploadAbortControllerRef.current?.abort();
  };

  const normalizeSource = useCallback((s: IncomingSource): LocalSource | null => {
    const rawStatus = (s.status || Status.SUCCESS).toString().toUpperCase();
    const incomingStatus: SourceStatus =
      rawStatus === Status.PROCESSING
        ? Status.PROCESSING
        : rawStatus === Status.FAILED
          ? Status.FAILED
          : Status.SUCCESS;

    const normalizedType = isAllowedSourceType(s.type) ? s.type : null;

    if (!normalizedType) return null;

    return {
      id: s.id ?? '',
      sourceTitle: s.sourceTitle ?? 'Untitled Source',
      type: normalizedType,
      fileId: s.fileId ?? '',
      file: s.file ?? { path: '', contentType: '' },
      status: incomingStatus,
    };
  }, []);

  const fetchSources = useCallback(async () => {
    if (!resolvedNotebookId) {
      setSources([]);
      setError('No notebook selected.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/notebooks/${resolvedNotebookId}/sources`);
      if (!response.ok) {
        throw new Error('Failed to load sources');
      }
      const data = await response.json();
      const normalized: LocalSource[] = Array.isArray(data.sources)
        ? (data.sources as IncomingSource[])
            .map(normalizeSource)
            .filter((s): s is LocalSource => s !== null)
        : [];
      setSources(normalized);
      setSelectedSourceIds([]);
    } catch (err) {
      console.error(err);
      setError('Unable to load sources right now.');
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [resolvedNotebookId, normalizeSource]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Reset drag over state when any modal opens
  useEffect(() => {
    if (modalOpen || discoverModalOpen || editModalOpen) {
      setIsDragOver(false);
    }
  }, [modalOpen, discoverModalOpen, editModalOpen]);
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.txt,.md,.csv,.doc,.docx,.pptx,.epub,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.webm,.json,.jsonl,.vtt,.srt"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <div
        className={`relative h-full flex flex-col rounded-2xl bg-transparent text-sm text-white/60 ${className}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 flex items-center justify-center text-primary text-sm font-medium">
            Drop files to upload
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-medium text-sm text-foreground">
                Sources <span className="ml-1 text-white/40 font-normal">({sources.length}/5)</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>You can add up to 5 documents in this demo UI.</p>
            </TooltipContent>
          </Tooltip>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="rounded-md px-3 py-1.5 text-xs font-medium"
                  variant="outline"
                  onClick={() => {
                    setAddSourceMode('discover');
                    setModalOpen(true);
                  }}
                >
                  <Search className="w-4 h-4 text-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Discover sources</p>
              </TooltipContent>
            </Tooltip>
            <Dialog
              open={modalOpen}
              onOpenChange={(open) => {
                setModalOpen(open);
                if (!open) {
                  setAddSourceMode('default');
                  setUrl('');
                  setCopiedText('');
                }
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="rounded-md px-3 py-1.5 text-xs font-medium"
                    variant="secondary"
                    onClick={() => {
                      setAddSourceMode('default');
                      setModalOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4 text-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add sources</p>
                </TooltipContent>
              </Tooltip>
              <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6">
                <DialogHeader>
                  <div className="flex items-center gap-2.5">
                    {addSourceMode !== 'default' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => setAddSourceMode('default')}
                        title="Back to all options"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </Button>
                    )}
                    <div>
                      <DialogTitle className="text-xl font-semibold">
                        {addSourceMode === 'default' && 'Add Sources'}
                        {addSourceMode === 'website' && 'Add Website Link'}
                        {addSourceMode === 'youtube' && 'Add YouTube Video'}
                        {addSourceMode === 'text' && 'Paste Text / Markdown'}
                        {addSourceMode === 'discover' && 'Discover Research Sources'}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        {addSourceMode === 'default' &&
                          'Upload files or connect web content to ground your notebook notes and chats.'}
                        {addSourceMode === 'website' &&
                          'Enter an article, blog post, documentation, or GitHub repo URL.'}
                        {addSourceMode === 'youtube' &&
                          'Enter a YouTube video URL to automatically extract and index its transcript.'}
                        {addSourceMode === 'text' &&
                          'Paste text, lecture transcripts, study notes, or raw markdown content.'}
                        {addSourceMode === 'discover' &&
                          'Search across the web with AI to find and import authoritative sources.'}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto min-h-0 pt-2 pb-1">
                  {addSourceMode === 'default' && (
                    <div className="flex flex-col gap-5">
                      {/* Drag & Drop File Upload Area */}
                      <div className="relative group">
                        <div
                          className={`min-h-[180px] border-2 border-dashed rounded-2xl bg-gradient-to-b from-muted/40 via-muted/20 to-transparent transition-all duration-200 cursor-pointer relative overflow-hidden flex flex-col items-center justify-center p-6 text-center ${
                            isDialogDragOver
                              ? 'border-primary bg-primary/10 scale-[0.99]'
                              : 'border-border/70 hover:border-primary/60 hover:bg-muted/30'
                          }`}
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={handleDialogDragOver}
                          onDragLeave={handleDialogDragLeave}
                          onDrop={handleDialogDrop}
                        >
                          {isDialogDragOver && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/15 text-primary font-medium text-sm backdrop-blur-[1px]">
                              Drop files to upload
                            </div>
                          )}
                          <div className="size-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                            <Plus className="size-5 text-primary" />
                          </div>
                          <h3 className="text-sm font-semibold text-foreground">Upload files</h3>
                          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                            Drag and drop your documents, audio, or video files here, or click to
                            browse
                          </p>
                          <div className="flex flex-wrap justify-center gap-1.5 mt-3 pointer-events-none">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              PDF, DOCX
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              TXT, MD, CSV
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                              MP3, WAV, M4A
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="relative flex items-center justify-center">
                        <div className="border-t border-border/60 w-full" />
                        <span className="bg-background px-3 text-xs font-medium text-muted-foreground/80 absolute">
                          Or choose a source type
                        </span>
                      </div>

                      {/* Action Cards Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setAddSourceMode('website');
                            setUrl('');
                          }}
                          className="group flex items-start gap-3.5 p-3.5 rounded-xl border border-border/70 bg-card hover:bg-accent/40 hover:border-primary/40 transition-all text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <div className="size-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
                            <Globe className="size-4 text-blue-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                              Website Link
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              Import articles, docs, or web pages
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAddSourceMode('youtube');
                            setUrl('');
                          }}
                          className="group flex items-start gap-3.5 p-3.5 rounded-xl border border-border/70 bg-card hover:bg-accent/40 hover:border-primary/40 transition-all text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <div className="size-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 group-hover:bg-red-500/20 transition-colors">
                            <YouTubeIcon className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                              YouTube Video
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              Transcribe and analyze video content
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAddSourceMode('text');
                            setCopiedText('');
                          }}
                          className="group flex items-start gap-3.5 p-3.5 rounded-xl border border-border/70 bg-card hover:bg-accent/40 hover:border-primary/40 transition-all text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <div className="size-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                            <FileText className="size-4 text-emerald-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                              Paste Text
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              Paste text excerpts, notes, or markdown
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAddSourceMode('discover');
                          }}
                          className="group flex items-start gap-3.5 p-3.5 rounded-xl border border-border/70 bg-card hover:bg-accent/40 hover:border-primary/40 transition-all text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <div className="size-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 transition-colors">
                            <Sparkles className="size-4 text-amber-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                              Discover Sources
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              Search the web with AI for research
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

                  {addSourceMode === 'website' && (
                    <div className="flex flex-col gap-4 py-2">
                      <div className="space-y-2">
                        <Label
                          htmlFor="website-url"
                          className="text-xs font-medium text-foreground"
                        >
                          Website or Documentation URL
                        </Label>
                        <div className="relative">
                          <input
                            id="website-url"
                            type="url"
                            className="w-full border border-border/80 rounded-xl px-3.5 py-2.5 text-sm bg-background pr-10 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="https://en.wikipedia.org/wiki/... or https://docs.example.com"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && url.trim() && !isLinkSubmitting) {
                                handleLinkSubmit();
                              }
                            }}
                            autoFocus
                          />
                          <Globe className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Supports web pages, articles, blog posts, and public GitHub repositories.
                        </p>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAddSourceMode('default')}
                        >
                          Back
                        </Button>
                        <Button
                          disabled={!url.trim() || isLinkSubmitting}
                          onClick={handleLinkSubmit}
                          className="gap-2"
                        >
                          {isLinkSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            'Add Website'
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {addSourceMode === 'youtube' && (
                    <div className="flex flex-col gap-4 py-2">
                      <div className="space-y-2">
                        <Label
                          htmlFor="youtube-url"
                          className="text-xs font-medium text-foreground"
                        >
                          YouTube Video URL
                        </Label>
                        <div className="relative">
                          <input
                            id="youtube-url"
                            type="url"
                            className="w-full border border-border/80 rounded-xl px-3.5 py-2.5 text-sm bg-background pr-10 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && url.trim() && !isLinkSubmitting) {
                                handleLinkSubmit();
                              }
                            }}
                            autoFocus
                          />
                          <YouTubeIcon className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          We will extract the video transcript so your AI co-pilot can cite and
                          reference it.
                        </p>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAddSourceMode('default')}
                        >
                          Back
                        </Button>
                        <Button
                          disabled={!url.trim() || isLinkSubmitting}
                          onClick={handleLinkSubmit}
                          className="gap-2"
                        >
                          {isLinkSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            'Add YouTube Video'
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {addSourceMode === 'text' && (
                    <div className="flex flex-col gap-4 py-2">
                      <div className="space-y-2">
                        <Label
                          htmlFor="copied-text"
                          className="text-xs font-medium text-foreground"
                        >
                          Paste Text or Markdown Content
                        </Label>
                        <ScrollArea className="h-[220px] w-full border border-border/80 rounded-xl bg-background">
                          <Textarea
                            id="copied-text"
                            className="w-full border-0 resize-none min-h-[220px] p-3.5 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                            placeholder="Paste your research, transcript, book summary, or notes here..."
                            value={copiedText}
                            onChange={(e) => setCopiedText(e.target.value)}
                            autoFocus
                          />
                        </ScrollArea>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Supports plain text and markdown</span>
                          <span>{copiedText.length} characters</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAddSourceMode('default')}
                        >
                          Back
                        </Button>
                        <Button
                          disabled={!copiedText.trim() || isPasteSubmitting}
                          onClick={handlePasteSubmit}
                          className="gap-2"
                        >
                          {isPasteSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            'Add Text Source'
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {addSourceMode === 'discover' && (
                    <div className="flex flex-col gap-4 py-2">
                      <div className="space-y-3">
                        <Label
                          htmlFor="discover-interest"
                          className="text-xs font-medium text-foreground"
                        >
                          What topic are you researching?
                        </Label>
                        <Textarea
                          id="discover-interest"
                          placeholder="Tell us what you're looking for (e.g. quantum computing breakthrough, renewable energy economics)..."
                          value={discoverInterest}
                          onChange={(e) => setDiscoverInterest(e.target.value)}
                          className="min-h-[100px] resize-none rounded-xl"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1.5 text-xs rounded-lg"
                          onClick={() => {
                            const curiousPrompts = [
                              'Artificial intelligence and machine learning advancements',
                              'Latest developments in fusion and renewable energy',
                              'Space exploration and deep astronomy',
                              'Modern cognitive productivity techniques',
                              'Decentralized systems and smart contracts',
                              'Quantum computing principles and architecture',
                            ];
                            const randomPrompt =
                              curiousPrompts[Math.floor(Math.random() * curiousPrompts.length)];
                            setDiscoverInterest(randomPrompt);
                          }}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>I'm feeling curious</span>
                        </Button>
                        <Button
                          className="flex-1 text-xs"
                          size="sm"
                          disabled={!discoverInterest.trim() || isDiscovering}
                          onClick={handleDiscoverSubmit}
                        >
                          {isDiscovering ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                              Discovering Sources...
                            </>
                          ) : (
                            'Search Sources'
                          )}
                        </Button>
                      </div>

                      {isDiscovering && (
                        <div className="border-t border-border/60 pt-4 space-y-3">
                          <h4 className="text-xs font-medium text-muted-foreground">
                            Finding sources on the web...
                          </h4>
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div
                              key={index}
                              className="flex items-start space-x-3 p-3.5 border rounded-xl"
                            >
                              <Skeleton className="h-4 w-4 rounded mt-1" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-2/3" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!isDiscovering && discoverInterest && discoveredSources.length === 0 && (
                        <div className="border-t border-border/60 pt-4 text-center py-6 text-muted-foreground">
                          <Search className="w-7 h-7 mx-auto mb-1.5 opacity-60" />
                          <p className="text-xs font-medium">No sources found for this search</p>
                          <p className="text-[11px] opacity-70">
                            Try adjusting your keywords or topic
                          </p>
                        </div>
                      )}

                      {!isDiscovering && discoveredSources.length > 0 && (
                        <div className="space-y-3 border-t border-border/60 pt-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-xs font-semibold text-foreground">
                                Discovered Sources ({discoveredSources.length})
                              </h4>
                              <p className="text-[11px] text-muted-foreground">
                                Select sources to import into this notebook
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="select-all-discovered"
                                checked={
                                  selectAllDiscovered ||
                                  (discoveredSources.length > 0 &&
                                    selectedDiscoveredSources.length === discoveredSources.length)
                                }
                                onCheckedChange={(checked) => {
                                  const isChecked = checked === true;
                                  setSelectAllDiscovered(isChecked);
                                  setSelectedDiscoveredSources(
                                    isChecked ? discoveredSources.map((_, idx) => idx) : []
                                  );
                                }}
                              />
                              <Label
                                htmlFor="select-all-discovered"
                                className="text-xs cursor-pointer"
                              >
                                Select All
                              </Label>
                            </div>
                          </div>

                          <div className="max-h-[240px] overflow-y-auto space-y-2 border rounded-xl p-2.5">
                            {discoveredSources.map((source, index) => (
                              <div
                                key={`${source.url}-${index}`}
                                className="flex items-start space-x-3 p-2.5 border border-border/60 rounded-lg hover:bg-muted/40 transition-colors"
                              >
                                <Checkbox
                                  className="mt-1"
                                  checked={
                                    selectAllDiscovered || selectedDiscoveredSources.includes(index)
                                  }
                                  onCheckedChange={(checked) => {
                                    const isChecked = checked === true;
                                    setSelectAllDiscovered(false);
                                    setSelectedDiscoveredSources((prev) =>
                                      isChecked ? [...prev, index] : prev.filter((i) => i !== index)
                                    );
                                  }}
                                />
                                <div className="flex items-start space-x-2.5 flex-1 min-w-0">
                                  <div className="shrink-0 mt-0.5">
                                    {source.favicon ? (
                                      <img
                                        src={source.favicon}
                                        alt=""
                                        className="w-4 h-4 rounded"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <Globe className="w-4 h-4 text-muted-foreground" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h5 className="font-medium text-xs truncate">{source.title}</h5>
                                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                      {source.content}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-between items-center pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAddSourceMode('default')}
                            >
                              Back
                            </Button>
                            <Button
                              size="sm"
                              disabled={selectedDiscoveredSources.length === 0 || isImporting}
                              className="gap-2"
                              onClick={handleImportSelected}
                            >
                              {isImporting ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Importing...
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  Import Selected ({selectedDiscoveredSources.length})
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {error ? <div className="px-4 py-2 text-xs text-destructive">{error}</div> : null}

        <div className="flex items-center px-4 py-2 border-b border-border">
          <Checkbox
            className="mr-2"
            checked={sources.length > 0 && selectedSourceIds.length === sources.length}
            onCheckedChange={(checked) => handleSelectAllSources(checked === true)}
          />
          <Label className="text-xs text-muted-foreground select-none cursor-pointer">
            Select all sources
          </Label>
        </div>

        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full w-full">
            <div className="py-2">
              {loading ? (
                <>
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div key={idx} className="flex items-center bg-card rounded-md px-2 py-2 mb-2">
                      <Skeleton className="w-8 h-8 rounded mr-2 shrink-0" />
                      <Skeleton className="flex-1 h-4 w-3/4" />
                      <div className="ml-2 flex items-center gap-2">
                        <Skeleton className="w-6 h-6 rounded" />
                        <Skeleton className="w-6 h-6 rounded" />
                      </div>
                    </div>
                  ))}
                </>
              ) : sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Icon
                    icon="mdi:file-document-outline"
                    className="w-8 h-8 mb-2 text-muted-foreground"
                  />
                  <p className="text-sm">No sources found</p>
                  <p className="text-xs">Add your first source to get started</p>
                </div>
              ) : (
                sources.map((source) => (
                  <div
                    key={source.id}
                    className="grid grid-cols-[32px_1fr_auto] items-center w-full bg-card rounded-md px-2 py-2 mb-2 relative overflow-hidden group"
                  >
                    {source.status === Status.PROCESSING && (
                      <div className="absolute inset-0 bg-linear-to-r from-transparent via-primary/20 to-transparent animate-shimmer"></div>
                    )}
                    <div className="relative z-10 flex items-center justify-center w-8 h-8">
                      {getFileIcon(source)}
                    </div>
                    <div className="min-w-0 relative z-10 px-1">
                      <p className="text-sm text-foreground truncate" title={source.sourceTitle}>
                        {source.sourceTitle}
                      </p>
                    </div>
                    <div className="relative z-10 flex items-center gap-1">
                      {source.status === Status.PROCESSING ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Cancel processing"
                          onClick={() => handleDeleteSource(source.id)}
                          disabled={isDeletingSourceId === source.id}
                        >
                          {isDeletingSourceId === source.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                          ) : (
                            <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                          )}
                        </Button>
                      ) : source.status === Status.FAILED ? (
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertCircle className="w-4 h-4 text-red-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Failed</p>
                            </TooltipContent>
                          </Tooltip>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Retry processing"
                            onClick={() => handleRetrySource(source.id)}
                          >
                            <RefreshCw className="w-3 h-3 text-muted-foreground hover:text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Delete source"
                            onClick={() => handleDeleteSource(source.id)}
                            disabled={isDeletingSourceId === source.id}
                          >
                            {isDeletingSourceId === source.id ? (
                              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                            ) : (
                              <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Checkbox
                            checked={selectedSourceIds.includes(source.id)}
                            onCheckedChange={(checked) =>
                              handleSelectSource(source.id, checked === true)
                            }
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingSource(source);
                                  setEditTitle(source.sourceTitle);
                                  setEditModalOpen(true);
                                }}
                              >
                                Edit Source Name
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDeleteSource(source.id)}
                              >
                                Delete Source
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <Dialog open={discoverModalOpen} onOpenChange={setDiscoverModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Discover Sources</DialogTitle>
            <DialogDescription>
              Find and add relevant sources from your connected accounts and recent activity.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto">
            <div className="space-y-3">
              <Label htmlFor="discover-interest" className="text-base font-medium">
                What are you interested in?
              </Label>
              <Textarea
                id="discover-interest"
                placeholder="Tell us what you're looking for..."
                value={discoverInterest}
                onChange={(e) => setDiscoverInterest(e.target.value)}
                className="min-h-[120px] resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => {
                  const curiousPrompts = [
                    'Artificial intelligence and machine learning',
                    'Latest developments in renewable energy',
                    'Space exploration and astronomy',
                    'Productivity techniques and tools',
                    'Blockchain and cryptocurrency',
                    'Sustainable living and environmental conservation',
                  ];
                  const randomPrompt =
                    curiousPrompts[Math.floor(Math.random() * curiousPrompts.length)];
                  setDiscoverInterest(randomPrompt);
                }}
              >
                <Sparkles className="w-4 h-4" />I am feeling Curious
              </Button>
              <Button
                className="flex-1"
                disabled={!discoverInterest.trim() || isDiscovering}
                onClick={handleDiscoverSubmit}
              >
                {isDiscovering ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Discovering...
                  </>
                ) : (
                  'Submit'
                )}
              </Button>
            </div>
            {isDiscovering && (
              <div className="border-t pt-4 flex-1">
                <h3 className="font-medium mb-3">Discovering sources...</h3>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-start space-x-3 p-4 border rounded-lg">
                      <Skeleton className="h-4 w-4 rounded mt-1" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                      <Skeleton className="h-8 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!isDiscovering && discoverInterest && discoveredSources.length === 0 && (
              <div className="border-t pt-4 flex-1">
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No sources found for your interest</p>
                  <p className="text-xs">Try a different search term</p>
                </div>
              </div>
            )}
          </div>
          {!isDiscovering && discoveredSources.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Discovered Sources ({discoveredSources.length})</h3>
                  <p className="text-sm text-muted-foreground">
                    Select sources to import into your notebook
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={
                      selectAllDiscovered ||
                      (discoveredSources.length > 0 &&
                        selectedDiscoveredSources.length === discoveredSources.length)
                    }
                    onCheckedChange={(checked) => {
                      const isChecked = checked === true;
                      setSelectAllDiscovered(isChecked);
                      setSelectedDiscoveredSources(
                        isChecked ? discoveredSources.map((_, idx) => idx) : []
                      );
                    }}
                    className="mr-2"
                  />
                  <Label className="text-sm">Select All</Label>
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto border rounded-lg p-4">
                <div className="space-y-3">
                  {discoveredSources.map((source, index) => (
                    <div
                      key={`${source.url}-${index}`}
                      className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        className="mt-1"
                        checked={selectAllDiscovered || selectedDiscoveredSources.includes(index)}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          setSelectAllDiscovered(false);
                          setSelectedDiscoveredSources((prev) =>
                            isChecked ? [...prev, index] : prev.filter((i) => i !== index)
                          );
                        }}
                      />
                      <div className="flex items-start space-x-3 flex-1 min-w-0">
                        <div className="shrink-0 mt-1">
                          {source.favicon ? (
                            <img
                              src={source.favicon}
                              alt=""
                              className="w-5 h-5 rounded"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-5 h-5 bg-muted rounded shrink-0 flex items-center justify-center">
                              {isGithubUrl(source.url) ? (
                                <Icon icon="mdi:github" className="w-3 h-3 text-muted-foreground" />
                              ) : (
                                <Icon
                                  icon="mdi:file-document-outline"
                                  className="w-3 h-3 text-muted-foreground"
                                />
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm line-clamp-1">{source.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                            {source.content.length > 100
                              ? `${source.content.substring(0, 100)}...`
                              : source.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={selectedDiscoveredSources.length === 0 || isImporting}
                  className="flex items-center gap-2"
                  onClick={handleImportSelected}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Import Selected
                      {selectedDiscoveredSources.length > 0 &&
                        ` (${selectedDiscoveredSources.length})`}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Source Name</DialogTitle>
            <DialogDescription>Update the name of your source.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Source Name</Label>
              <input
                id="edit-title"
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter source name..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingSource(null);
                  setEditTitle('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={!editTitle.trim() || isUpdatingTitle}>
                {isUpdatingTitle ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
