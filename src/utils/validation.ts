import { VALID_IMAGE_MIME_TYPES, config } from "../config/config";

export interface FieldSpec {
  value: string;
  maxLength: number;
  label: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  cleaned?: Record<string, string>;
}

/**
 * Validates a set of modal text fields: trims whitespace, rejects empty
 * values, and enforces maximum lengths.
 */
export function validateFields(fields: Record<string, FieldSpec>): ValidationResult {
  const cleaned: Record<string, string> = {};

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

export interface AttachmentLike {
  contentType?: string | null;
  size: number;
  name: string;
}

export interface ProofValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validates that an uploaded attachment is a legitimate proof image.
 * Only checks file type/size — never inspects or judges image content.
 */
export function validateProofAttachment(attachment: AttachmentLike): ProofValidationResult {
  const contentType = attachment.contentType?.toLowerCase();

  if (!contentType || !VALID_IMAGE_MIME_TYPES.has(contentType)) {
    return {
      ok: false,
      error: "❌ Invalid proof.\n\nPlease upload an image file such as PNG, JPG, JPEG, or WEBP.",
    };
  }

  const maxBytes = config.maxProofSizeMb * 1024 * 1024;
  if (attachment.size > maxBytes) {
    return {
      ok: false,
      error: `❌ Proof image is too large.\n\nMaximum allowed size: ${config.maxProofSizeMb} MB.`,
    };
  }

  return { ok: true };
}

export function extensionFromContentType(contentType: string): string {
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
