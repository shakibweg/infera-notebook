import { deleteFile, uploadAsset, getSignedDownloadUrl, getPresignedUploadUrl } from '@/lib/s3';
import { AllowedNoteType } from '@/generated/prisma/enums';

/**
 * Note Content Asset Resolver
 *
 * Traverses AI-generated note content and transforms internal S3 keys (paths)
 * into temporary, public signed URLs for the client.
 */
export async function resolveNoteAssets(note: any): Promise<any> {
  if (!note || !note.content || note.content === '') {
    return note;
  }

  try {
    let parsedContent: any;
    try {
      parsedContent = JSON.parse(note.content);
    } catch (e) {
      // If NOT JSON, it's likely a simple text note (CHAT_NOTE, EDITABLE_NOTE, etc).
      return note;
    }

    const type = note.type as AllowedNoteType;

    // Route resolution remains empty for types that handle assets on the client
    // via the 'useSignedUrls' hook (Infographics, Slide Decks, Audio/Video Overviews).
    switch (type) {
      default:
        // No assets to resolve at the server layer for these types
        return note;
    }

    // Re-serialize with resolved URLs (transient)
    return {
      ...note,
      content: JSON.stringify(parsedContent),
    };
  } catch (error) {
    console.error(`[RESOLVE_NOTE_ASSETS_ERROR] Failed to resolve note ${note.id}:`, error);
    return note;
  }
}
