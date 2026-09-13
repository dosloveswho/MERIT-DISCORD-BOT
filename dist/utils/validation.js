"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFields = validateFields;
exports.validateProofAttachment = validateProofAttachment;
exports.extensionFromContentType = extensionFromContentType;
const config_1 = require("../config/config");
/**
 * Validates a set of modal text fields: trims whitespace, rejects empty
 * values, and enforces maximum lengths.
 */
function validateFields(fields) {
    const cleaned = {};
    for (const [key, spec] of Object.entries(fields)) {
        const trimmed = spec.value.trim();
        if (trimmed.length === 0) {
            return { ok: false, error: `${spec.label} cannot be empty.` };
        }
        if (trimmed.length > spec.maxLength) {
            return {
                ok: false,
                error: `${spec.label} must be at most ${spec.maxLength} characters.`,
            };
        }
        cleaned[key] = trimmed;
    }
    return { ok: true, cleaned };
}
/**
 * Validates that an uploaded attachment is a legitimate proof image.
 * Only checks file type/size — never inspects or judges image content.
 */
function validateProofAttachment(attachment) {
    const contentType = attachment.contentType?.toLowerCase();
    if (!contentType || !config_1.VALID_IMAGE_MIME_TYPES.has(contentType)) {
        return {
            ok: false,
            error: "❌ Invalid proof.\n\nPlease upload an image file such as PNG, JPG, JPEG, or WEBP.",
        };
    }
    const maxBytes = config_1.config.maxProofSizeMb * 1024 * 1024;
    if (attachment.size > maxBytes) {
        return {
            ok: false,
            error: `❌ Proof image is too large.\n\nMaximum allowed size: ${config_1.config.maxProofSizeMb} MB.`,
        };
    }
    return { ok: true };
}
function extensionFromContentType(contentType) {
    switch (contentType.toLowerCase()) {
        case "image/png":
            return "png";
        case "image/jpeg":
            return "jpg";
        case "image/webp":
            return "webp";
        default:
            return "bin";
    }
}
