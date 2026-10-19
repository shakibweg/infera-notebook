'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Notebook, useNotebookStore } from '@/hooks/useNotebookStore';
import { UserButtonSimpleTheme } from '@/components/user/user-button-simple-theme';
import { ModeToggle } from '@/components/theme/mode-toggle';
import { ChatsPanel } from './_components/ChatsPanel';
import { NotesPanel } from './_components/NotesPanel';
import { SourcePanel } from './_components/SourcePanel';
import { useParams, useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import { NotebookSettingsDialog } from './_components/NotebookSettingsDialog';

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

type TabValue = 'source' | 'chats' | 'notes';

import { CreditBadge } from '@/components/user/credit-badge';

/**
 * NotebookPage component.
 * The detailed view for a single notebook.
 * Features a responsive layout:
 * - Desktop: 3-panel resizable layout (Source, Chats, Notes).
 * - Mobile: Tabbed interface.
 * Supports renaming the notebook by double-clicking the title in the breadcrumb.
 */
export default function NotebookPage() {
  const params = useParams<{ notebookId: string | string[] }>();
  const router = useRouter();
  const notebookId = Array.isArray(params.notebookId) ? params.notebookId[0] : params.notebookId;
  const { currentNotebook, setCurrentNotebook } = useNotebookStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabValue>('source');

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value as TabValue);
  };

  /**
   * Effect hook to fetch notebook details when the component mounts or the ID changes.
   * Normalizes the fetched data and updates the global notebook store.
   */
  useEffect(() => {
    let isMounted = true;

    const fetchNotebook = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/notebooks/${notebookId}`);

        if (!response.ok) {
          throw new Error('Failed to load notebook');
        }

        const data = await response.json();
        const normalized: Notebook = {
          id: data.notebook?.id ?? notebookId,
          title: data.notebook?.title ?? `Notebook ${notebookId}`,
          content: data.notebook?.content ?? '',
          createdAt: data.notebook?.createdAt ? new Date(data.notebook.createdAt) : new Date(),
          updatedAt: data.notebook?.updatedAt ? new Date(data.notebook.updatedAt) : new Date(),
        };

        if (isMounted) {
          setCurrentNotebook(normalized);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setError('Unable to load this notebook right now.');
          setCurrentNotebook(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchNotebook();

    return () => {
      isMounted = false;
      setCurrentNotebook(null);
    };
  }, [notebookId, setCurrentNotebook]);

  const handleTitleDoubleClick = () => {
    if (loading || !currentNotebook) return;
    setEditedTitle(currentNotebook.title);
    setIsEditingTitle(true);
  };

  /**
   * Persists the edited notebook title to the server.
   * Updates the global store upon success.
   */
  const handleTitleSave = async () => {
    if (!currentNotebook || !editedTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }

    if (editedTitle.trim() === currentNotebook.title) {
      setIsEditingTitle(false);
      return;
    }

    setIsSavingTitle(true);
    try {
      const response = await fetch(`/api/notebooks/${notebookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editedTitle.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to update notebook title');
      }

      const data = await response.json();
      const updatedNotebook: Notebook = {
        ...currentNotebook,
        title: data.notebook?.title ?? editedTitle.trim(),
        updatedAt: data.notebook?.updatedAt ? new Date(data.notebook.updatedAt) : new Date(),
      };

      setCurrentNotebook(updatedNotebook);
      setIsEditingTitle(false);
    } catch (err) {
      console.error(err);
      setError('Failed to update notebook title');
      setIsEditingTitle(false);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const { notebooks, setNotebooks } = useNotebookStore();
  const safeNotebooks = Array.isArray(notebooks) ? notebooks : [];

  const createNotebook = async () => {
    try {
      setCreating(true);
      setError(null);
      setCreateError(null);
      const fallbackName = `Notebook ${new Date().toLocaleString()}`;
      const title = newNotebookName.trim() || fallbackName;
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        throw new Error('Failed to create notebook');
      }
      const data = await res.json();
      const newNotebook: Notebook = {
        id: data.notebook?.id ?? randomId(),
        title: data.notebook?.title ?? title,
        content: data.notebook?.content ?? '',
        createdAt: data.notebook?.createdAt ? new Date(data.notebook.createdAt) : new Date(),
        updatedAt: data.notebook?.updatedAt ? new Date(data.notebook.updatedAt) : new Date(),
      };
      setNotebooks([newNotebook, ...safeNotebooks]);
      setCreateDialogOpen(false);
      setNewNotebookName('');
      // Optionally redirect to the new notebook
      router.push(`/notebooks/${newNotebook.id}`);
    } catch (err) {
      console.error(err);
      setCreateError('Unable to create notebook right now.');
      setCreateDialogOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-4 bg-background/50 backdrop-blur-md sticky top-0 z-50 sm:px-6 lg:px-8">
        <Breadcrumb>
          <BreadcrumbList className="text-muted-foreground">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/notebooks" className="hover:text-foreground">
                  Notebooks
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {loading ? (
                <Skeleton className="h-4 w-32 bg-muted" />
              ) : isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTitleSave();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleTitleCancel();
                    }
                  }}
                  disabled={isSavingTitle}
                  className="bg-transparent border-0 outline-none p-0 m-0 text-sm font-semibold text-foreground inline-block min-w-[200px]"
                  style={{ lineHeight: 'inherit' }}
                />
              ) : (
                <BreadcrumbPage
                  className="font-semibold text-foreground cursor-pointer hover:text-muted-foreground transition-colors"
                  onDoubleClick={handleTitleDoubleClick}
                  title="Double-click to edit"
                >
                  {currentNotebook?.title ?? `#${notebookId}`}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-4">
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <CreditBadge className="hidden sm:flex" />

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                disabled={creating}
                className="h-8 rounded-full bg-primary px-4 text-[11px] font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 disabled:opacity-60"
              >
                New Notebook
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-card">
              <DialogHeader>
                <DialogTitle className="text-card-foreground">Create notebook</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Give your notebook a name. You can change it later.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!newNotebookName.trim()) {
                    setCreateError('Please enter a notebook name.');
                    return;
                  }
                  createNotebook();
                }}
              >
                <div className="space-y-2">
                  <label className="text-sm text-foreground">Notebook name</label>
                  <Input
                    autoFocus
                    value={newNotebookName}
                    onChange={(e) => {
                      setNewNotebookName(e.target.value);
                      if (createError) setCreateError(null);
                    }}
                    placeholder="e.g. Product Discovery"
                    className="border-border bg-background"
                  />
                  {createError ? <p className="text-xs text-destructive">{createError}</p> : null}
                </div>
                <DialogFooter className="sm:justify-end">
                  <Button type="button" variant="ghost" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating || !newNotebookName.trim()}>
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <NotebookSettingsDialog notebookId={notebookId} />

          <ModeToggle />
          <UserButtonSimpleTheme
            afterSignOutUrl="/sign-in"
            appearance={{
              elements: {
                avatarBox: 'w-8 h-8',
              },
            }}
          />
        </div>
      </header>

      <main className="flex flex-1 min-h-0 flex-col overflow-hidden">
        {/* Mobile: tabs layout */}
        <div className="flex flex-1 min-h-0 flex-col px-4 pb-4 pt-2 lg:hidden overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="flex h-full min-h-0 flex-col items-center gap-4 overflow-hidden"
          >
            <TabsList className="mx-auto rounded-full border border-border bg-card px-1 py-1 shrink-0">
              <TabsTrigger
                value="source"
                className="rounded-full px-4 py-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Source
              </TabsTrigger>
              <TabsTrigger
                value="chats"
                className="rounded-full px-4 py-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Chats
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                className="rounded-full px-4 py-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Notes
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="source"
              className="flex-1 w-full min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col mt-0"
            >
              <SourcePanel notebookId={notebookId} />
            </TabsContent>

            <TabsContent
              value="chats"
              className="flex-1 w-full min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col mt-0"
            >
              <ChatsPanel notebookId={notebookId} />
            </TabsContent>

            <TabsContent
              value="notes"
              className="flex-1 w-full min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col mt-0"
            >
              <NotesPanel notebookId={notebookId} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Desktop: resizable 3-panel layout – fills all remaining height */}
        <div className="hidden flex-1 min-h-0 lg:flex">
          <ResizablePanelGroup
            direction="horizontal"
            className="flex-1 min-h-0 gap-3 overflow-hidden px-6"
          >
            <ResizablePanel defaultSize={20} minSize={20} className="flex h-full flex-col">
              <SourcePanel notebookId={notebookId} />
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-border" />

            <ResizablePanel defaultSize={50} minSize={30} className="flex h-full flex-col">
              <ChatsPanel notebookId={notebookId} />
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-border" />

            <ResizablePanel defaultSize={30} minSize={20} className="flex h-full flex-col">
              <NotesPanel notebookId={notebookId} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </main>
    </div>
  );
}
