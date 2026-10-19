/**
 * Notebook Messages API
 * Handles the storage and retrieval of chat history for a specific notebook.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/actions/user';

/**
 * GET Handler
 * Fetches all chat messages for a notebook in chronological order.
 */
export async function GET(req: Request, { params }: { params: Promise<{ notebookId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { notebookId } = await params;

    if (!notebookId) {
      return NextResponse.json({ error: 'notebookId is required' }, { status: 400 });
    }

    // Verify notebook belongs to user
    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: user.id,
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    // Fetch messages for this notebook, ordered by creation date
    const dbMessages = await prisma.message.findMany({
      where: {
        notebookId: notebookId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json({ messages: dbMessages });
  } catch (error) {
    console.error('[MESSAGES]', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { notebookId } = await params;

    if (!notebookId) {
      return NextResponse.json({ error: 'notebookId is required' }, { status: 400 });
    }

    // Verify notebook belongs to user
    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: user.id,
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    // Delete all messages for this notebook
    await prisma.message.deleteMany({
      where: {
        notebookId: notebookId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MESSAGES DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 });
  }
}
