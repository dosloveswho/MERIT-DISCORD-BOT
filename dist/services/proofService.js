"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processProofAttachment = processProofAttachment;
const databaseService_1 = require("./databaseService");
const validation_1 = require("../utils/validation");
const logger_1 = require("../utils/logger");
/**
 * Validates a Discord attachment as proof, downloads it from Discord's
 * CDN, and re-uploads it to Supabase Storage so the bot never relies on
 * Discord's temporary attachment URLs for persistence.
 */
async function processProofAttachment(attachment, discordUserId, submissionId) {
    const validation = (0, validation_1.validateProofAttachment)({
        contentType: attachment.contentType,
        size: attachment.size,
        name: attachment.name,
    });
    if (!validation.ok) {
        return { ok: false, error: validation.error };
    }
    const contentType = attachment.contentType.toLowerCase();
    try {
        const response = await fetch(attachment.url);
        if (!response.ok) {
            throw new Error(`Failed to download attachment: HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const extension = (0, validation_1.extensionFromContentType)(contentType);
        const { storagePath } = await databaseService_1.databaseService.uploadProofImage({
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
    }
    catch (error) {
        logger_1.logger.error("processProofAttachment failed", error, { discordUserId, submissionId });
        return {
            ok: false,
            error: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
        };
    }
}
