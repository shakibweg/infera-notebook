/**
 * Notebook Sources Controller
 * Manages the attachments (PDFs, Links, etc.) linked to a specific notebook.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/actions/user';
import { notebookIdParamSchema, createSourceBodySchema } from '@/validators/sources';
import { inngest } from '@/inngest/client';
import { Status } from '@/generated/prisma/enums';
import { deleteFile, uploadAsset, getSignedDownloadUrl, getPresignedUploadUrl } from '@/lib/s3';
import { initializeVectorStore } from '@/lib/pinecone';
import { deductCredit } from '@/actions/credits';

/**
 * GET Handler
 * Returns all sources associated with a notebook, ordered by most recent.
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

    const { notebookId: rawNotebookId } = await params;

    // Validate notebookId parameter
    const paramValidation = notebookIdParamSchema.safeParse({
      notebookId: rawNotebookId,
    });

    if (!paramValidation.success) {
      return NextResponse.json(
        {
          error: 'Invalid notebook ID',
          details: paramValidation.error.issues,
        },
        { status: 400 }
      );
    }

    const { notebookId } = paramValidation.data;

    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: user.id,
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    const sources = await prisma.source.findMany({
      where: { notebookId },
      include: { file: true },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ sources });
  } catch (error) {
    console.error('[GET_SOURCES_BY_NOTEBOOK]', error);
    return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { notebookId: rawNotebookId } = await params;

    // Validate notebookId parameter
    const paramValidation = notebookIdParamSchema.safeParse({
      notebookId: rawNotebookId,
    });

    if (!paramValidation.success) {
      return NextResponse.json(
        {
          error: 'Invalid notebook ID',
          details: paramValidation.error.issues,
        },
        { status: 400 }
      );
    }

    const { notebookId } = paramValidation.data;

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    // Validate request body
    const bodyValidation = createSourceBodySchema.safeParse(body);

    if (!bodyValidation.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: bodyValidation.error.issues,
        },
        { status: 400 }
      );
    }

    const { sourceTitle, type, file } = bodyValidation.data;

    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: user.id,
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    // Deduct credit for file upload
    const success = await deductCredit(user.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Credits exhausted. Please wait for the daily reset.' },
        { status: 403 }
      );
    }

    const source = await prisma.source.create({
      data: {
        sourceTitle,
        type,
        status: Status.PROCESSING,
        notebook: { connect: { id: notebookId } },
        file: {
          create: {
            path: file.path,
            contentType: file.contentType,
          },
        },
      },
      include: { file: true },
    });

    // Send event to Inngest for processing
    await inngest.send({
      name: 'notebook/source-process',
      data: {
        sourceId: source.id,
        notebookId: source.notebookId,
        type: source.type,
        sourceTitle: source.sourceTitle,
        url: source.file.path,
        userId: user.id,
      },
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    console.error('[CREATE_SOURCE]', error);
    return NextResponse.json({ error: 'Failed to create source' }, { status: 500 });
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

    const { notebookId: rawNotebookId } = await params;
    const paramValidation = notebookIdParamSchema.safeParse({ notebookId: rawNotebookId });

    if (!paramValidation.success) {
      return NextResponse.json({ error: 'Invalid notebook ID' }, { status: 400 });
    }

    const { notebookId } = paramValidation.data;

    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, userId: user.id },
    });

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    // 1. Get all sources to clean up external storage
    const sources = await prisma.source.findMany({
      where: { notebookId },
      include: { file: true },
    });

    // 2. Cleanup Storage (S3/R2)
    for (const source of sources) {
      if (source.file?.path) {
        try {
          await deleteFile(source.file.path);
        } catch (e) {
          console.error(`[DELETE_ALL_SOURCES] S3 cleanup failed for ${source.id}:`, e);
        }
      }
    }

    // 3. Cleanup Pinecone
    try {
      const vectorStore = await initializeVectorStore();
      await vectorStore.delete({
        filter: { notebookId: { $eq: notebookId } },
      });
    } catch (e) {
      console.error('[DELETE_ALL_SOURCES] Pinecone failed:', e);
    }

    // 4. Delete from Database
    await prisma.source.deleteMany({
      where: { notebookId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE_ALL_SOURCES]', error);
    return NextResponse.json({ error: 'Failed to delete sources' }, { status: 500 });
  }
}
