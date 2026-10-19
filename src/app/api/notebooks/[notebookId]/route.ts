/**
 * Single Notebook Instance API
 * Handles operations on a specific notebook identified by its UUID.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/actions/user';
import { deleteFile, uploadAsset, getSignedDownloadUrl, getPresignedUploadUrl } from '@/lib/s3';
import { initializeVectorStore } from '@/lib/pinecone';
import { AllowedNoteType } from '@/generated/prisma/enums';
import { inngest } from '@/inngest/client';

/**
 * GET Handler
 * Retrieves the basic metadata for a specific notebook.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { notebookId } = await params;
    if (!notebookId) {
      return NextResponse.json({ error: 'Notebook ID is required' }, { status: 400 });
    }

    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: user.id,
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    return NextResponse.json({ notebook });
  } catch (error) {
    console.error('[GET_NOTEBOOK_BY_ID]', error);
    return NextResponse.json({ error: 'Failed to fetch notebook' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { notebookId } = await params;
    if (!notebookId) {
      return NextResponse.json({ error: 'Notebook ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const title =
      typeof body?.title === 'string' && body.title.trim().length > 0 ? body.title.trim() : null;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: user.id,
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    const updatedNotebook = await prisma.notebook.update({
      where: { id: notebookId },
      data: { title },
    });

    return NextResponse.json({ notebook: updatedNotebook });
  } catch (error) {
    console.error('[UPDATE_NOTEBOOK]', error);
    return NextResponse.json({ error: 'Failed to update notebook' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { notebookId } = await params;
    if (!notebookId) {
      return NextResponse.json({ error: 'Notebook ID is required' }, { status: 400 });
    }

    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: user.id,
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    // 1. Fetch all sources to clean up external storage
    const sources = await prisma.source.findMany({
      where: { notebookId, notebook: { userId: user.id } },
      include: { file: true },
    });

    // 2. Fetch all notes to clean up external storage and pending generations
    const notes = await prisma.note.findMany({
      where: {
        notebookId,
        notebook: { userId: user.id },
      },
    });

    // 3. Cleanup Pincone Vectors
    try {
      const vectorStore = await initializeVectorStore();
      await vectorStore.delete({
        filter: { notebookId: { $eq: notebookId } },
      });
    } catch (e) {
      console.error('[DELETE_NOTEBOOK] Pinecone cleanup failed:', e);
    }

    // 4. Cleanup S3 Storage for Sources
    for (const source of sources) {
      if (source.file?.path) {
        try {
          await deleteFile(source.file.path);
        } catch (e) {
          console.error(`[DELETE_NOTEBOOK] S3 source cleanup failed for ${source.id}:`, e);
        }
      }
    }

    // 5. Cleanup S3 Storage and Pending Generations for Notes
    for (const note of notes) {
      // Clean up assets directly
      if (note.content) {
        try {
          const parsed = JSON.parse(note.content);
          const paths: string[] = [];
          if (note.type === AllowedNoteType.INFOGRAPHIC && parsed.path) paths.push(parsed.path);
          if (note.type === AllowedNoteType.SLIDE_DECK && Array.isArray(parsed)) {
            parsed.forEach((s: any) => s.path && paths.push(s.path));
          }
          if (note.type === AllowedNoteType.AUDIO_OVERVIEW && parsed.path) paths.push(parsed.path);
          if (note.type === AllowedNoteType.VIDEO_OVERVIEW) {
            if (parsed.path) paths.push(parsed.path);
            if (Array.isArray(parsed.images)) {
              parsed.images.forEach((img: any) => img.path && paths.push(img.path));
            }
          }
          await Promise.allSettled(paths.map((p) => deleteFile(p)));
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Fire Inngest event to cancel any active generations
      await inngest
        .send({
          name: 'note/deleted',
          data: { noteId: note.id },
        })
        .catch((e) =>
          console.error(`[DELETE_NOTEBOOK] Inngest event failed for note ${note.id}:`, e)
        );
    }

    // 6. Delete the notebook (cascade deletes will handle related DB records)
    await prisma.notebook.delete({
      where: { id: notebookId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE_NOTEBOOK]', error);
    return NextResponse.json({ error: 'Failed to delete notebook' }, { status: 500 });
  }
}
