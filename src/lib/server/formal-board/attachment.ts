import "server-only";

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "application/pdf", "text/plain"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export function validateAttachmentInput(input: { name?: unknown; mediaType?: unknown; sizeBytes?: unknown }) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const mediaType = typeof input.mediaType === "string" ? input.mediaType : "";
  const sizeBytes = typeof input.sizeBytes === "number" ? input.sizeBytes : NaN;
  if (!name || name.length > 255 || /[\\/\0\r\n]/.test(name) || name.startsWith(".")) throw new Error("文件名无效。");
  if (!(ATTACHMENT_TYPES as readonly string[]).includes(mediaType)) throw new Error("文件类型不在允许列表中。");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > ATTACHMENT_MAX_BYTES) throw new Error("文件大小超过 10 MiB 限制。");
  return { name, mediaType: mediaType as AttachmentType, sizeBytes };
}
