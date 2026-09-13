import { Attachment } from "discord.js";
import { databaseService } from "./databaseService";
import { extensionFromContentType, validateProofAttachment } from "../utils/validation";
import { logger } from "../utils/logger";

export interface ProofUploadResult {
  ok: true;
  storagePath: string;
  filename: string;
  contentType: string;
}

export interface ProofUploadError {
  ok: false;
  error: string;
}

/**
 * Validates a Discord attachment as proof, downloads it from Discord's
 * CDN, and re-uploads it to Supabase Storage so the bot never relies on
 * Discord's temporary attachment URLs for persistence.
 */
export async function processProofAttachment(
  attachment: Attachment,
  discordUserId: string,
  submissionId: string
): Promise<ProofUploadResult | ProofUploadError> {
  const validation = validateProofAttachment({
    contentType: attachment.contentType,
    size: attachment.size,
    name: attachment.name,
  });

  if (!validation.ok) {
    return { ok: false, error: validation.error! };
  }

  const contentType = attachment.contentType!.toLowerCase();

  try {
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`Failed to download attachment: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extension = extensionFromContentType(contentType);

    const { storagePath } = await databaseService.uploadProofImage({
      discordUserId,
      submissionId,
      buffer,
      contentType,
      extension,
    });

    return {
      ok: true,
      storagePath,
      filename: attachment.name,
      contentType,
    };
  } catch (error) {
    logger.error("processProofAttachment failed", error, { discordUserId, submissionId });
    return {
      ok: false,
      error: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
    };
  }
}
