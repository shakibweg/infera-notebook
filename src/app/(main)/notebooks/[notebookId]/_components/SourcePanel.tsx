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
  Youtube,
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
import { useNotebookStore, type Source, type SourceStatus } from '@/hooks/useNotebookStore';
import { useInngestSubscription } from '@inngest/realtime/hooks';
import { fetchNotebookRealtimeSubscriptionToken } from '@/actions/inngest-realtime';

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
        return <Icon icon="mdi:youtube" className="w-4 h-4 text-[#FF4D4D]" />;
      case 'WEBSITE':
        return <Icon icon="mdi:web" className="w-4 h-4 text-muted-foreground" />;
      case 'GITHUB':
        return <Icon icon="mdi:github" className="w-4 h-4 text-muted-foreground" />;
      default:
        if (urlVal.includes('youtube.com') || urlVal.includes('youtu.be')) {
          return <Icon icon="mdi:youtube" className="w-4 h-4 text-[#FF4D4D]" />;
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
                  onClick={() => setDiscoverModalOpen(true)}
                >
                  <Search className="w-4 h-4 text-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Discover sources</p>
              </TooltipContent>
            </Tooltip>
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button
                      className="rounded-md px-3 py-1.5 text-xs font-medium"
                      variant="secondary"
                    >
                      <Plus className="w-4 h-4 text-foreground" />
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add sources</p>
                </TooltipContent>
              </Tooltip>
              <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Add Sources</DialogTitle>
                  <DialogDescription>
                    Sources let Infera Notebook base its responses on the information that matters
                    most to you.
                  </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="upload" className="w-full flex-1 flex flex-col min-h-0">
                  <TabsList className="grid w-full grid-cols-3 mb-6 shrink-0">
                    <TabsTrigger value="upload">Upload</TabsTrigger>
                    <TabsTrigger value="link">Link</TabsTrigger>
                    <TabsTrigger value="paste">Paste Text</TabsTrigger>
                  </TabsList>
                  <TabsContent value="upload">
                    <div className="w-full max-w-4xl mx-auto">
                      <div className="relative group">
                        <div
                          className={`min-h-64 border-2 border-dashed rounded-xl bg-linear-to-br from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-800 transition-all duration-200 ease-in-out cursor-pointer relative overflow-hidden ${
                            isDialogDragOver
                              ? 'border-primary bg-primary/5'
                              : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
                          }`}
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={handleDialogDragOver}
                          onDragLeave={handleDialogDragLeave}
                          onDrop={handleDialogDrop}
                        >
                          {isDialogDragOver && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 text-primary font-medium">
                              Drop files to upload
                            </div>
                          )}
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 pointer-events-none">
                            <div className="flex flex-col items-center gap-4 text-center">
                              <div className="relative">
                                <div className="w-16 h-16 bg-primary/10 rounded-full shrink-0 flex items-center justify-center mb-4">
                                  <Plus className="w-8 h-8 text-primary" />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <h3 className="text-lg font-semibold text-foreground">
                                  Upload your files
                                </h3>
                                <p className="text-sm text-muted-foreground max-w-md">
                                  Drag and drop files here, or click anywhere to browse
                                </p>
                              </div>
                              <div className="flex flex-wrap justify-center gap-2 mt-4">
                                <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-md text-xs">
                                  <Icon icon="mdi:file-document-outline" className="w-3 h-3" />
                                  PDF, DOC, DOCX
                                </div>
                                <div className="flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded-md text-xs">
                                  <Icon icon="mdi:file-document-outline" className="w-3 h-3" />
                                  TXT, MD, CSV
                                </div>
                                <div className="flex items-center gap-1 px-2 py-1 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 rounded-md text-xs">
                                  <Icon icon="mdi:volume-high" className="w-3 h-3" />
                                  MP3, WAV, M4A
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 text-center">
                        <p className="text-xs text-muted-foreground">
                          Maximum file size: 5MB per file • Supported formats: PDF, DOC, DOCX, TXT,
                          Markdown, CSV, Audio files
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="link">
                    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4 items-center justify-center py-4">
                      <div className="flex flex-col gap-4 w-full">
                        <div className="flex flex-col gap-2 w-full">
                          <Label htmlFor="url-input">URL</Label>
                          <div className="relative">
                            <input
                              id="url-input"
                              type="url"
                              className="w-full border rounded px-3 py-2 text-sm pr-20"
                              placeholder="https://example.com or https://youtube.com/watch?v=..."
                              value={url}
                              onChange={(e) => setUrl(e.target.value)}
                            />
                            {url.trim() && (
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                {(() => {
                                  const linkType = determineLinkType(url.trim());
                                  const badgeStyles =
                                    linkType === 'YOUTUBE'
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                      : linkType === 'GITHUB'
                                        ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
                                  return (
                                    <span
                                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${badgeStyles}`}
                                    >
                                      {linkType === 'YOUTUBE' ? (
                                        <>
                                          <Icon icon="mdi:youtube" className="w-3.5 h-3.5" />
                                          YouTube
                                        </>
                                      ) : linkType === 'GITHUB' ? (
                                        <>
                                          <Icon icon="mdi:github" className="w-3.5 h-3.5" />
                                          GitHub
                                        </>
                                      ) : (
                                        <>
                                          <Icon icon="mdi:web" className="w-3.5 h-3.5" />
                                          Website
                                        </>
                                      )}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            className="self-end mt-2"
                            disabled={!url.trim() || isLinkSubmitting}
                            onClick={handleLinkSubmit}
                          >
                            {isLinkSubmitting ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Adding...
                              </>
                            ) : (
                              <>
                                Add{' '}
                                {(() => {
                                  const linkType = determineLinkType(url.trim());
                                  return linkType === 'YOUTUBE'
                                    ? 'YouTube'
                                    : linkType === 'GITHUB'
                                      ? 'GitHub'
                                      : 'Website';
                                })()}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="paste">
                    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4 py-4">
                      <ScrollArea className="h-[200px] w-full border rounded-md">
                        <Textarea
                          id="copied-text"
                          className="w-full border-0 resize-none min-h-[200px]"
                          placeholder="Paste your text here..."
                          value={copiedText}
                          onChange={(e) => setCopiedText(e.target.value)}
                        />
                      </ScrollArea>
                      <Button
                        variant="outline"
                        className="self-end mt-2"
                        disabled={!copiedText.trim() || isPasteSubmitting}
                        onClick={handlePasteSubmit}
                      >
                        {isPasteSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          'Add Text'
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
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
