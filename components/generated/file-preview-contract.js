// File payload preview contract: the pure half of the file-surface
// decision helpers. Kept free of
// component imports so card/preview surfaces resolve payload preview
// policy without pulling the editor-surface registry graph.
import { RENDERABLE_PREVIEW_MODES } from '#shared/ui-mapping/index.js';

// Instance payload blobs live in the `files` GridFS bucket (SPEC §3 Blob
// home); the wire payload reference carries no bucket by design.
const PAYLOAD_BUCKET = 'files';

/**
 * Download URL for a file instance's payload reference.
 */
export function instancePayloadFileUrl(attachment = {}) {
  if (!attachment?.fileId) return '';
  return `/api/files/download/${encodeURIComponent(String(attachment.fileId))}?bucket=${PAYLOAD_BUCKET}`;
}

/**
 * Pure preview decision for a file instance: the type's payload traits
 * supply the mode (`payload.preview`, the SPEC §4 preview trait; the
 * render-facet cut removed the `render.preview` channel), the wire
 * `attachments.primary` supplies the payload reference. Returns
 * `{ mode, fileUrl, renderable, hasPayload }`; a null type or a type
 * without payload policy resolves mode `'none'`.
 */
export function resolveFilePreview(entity = {}, type = null) {
  const attachment = entity?.attachments?.primary || null;
  const hasPayload = Boolean(attachment?.fileId);
  const declared = type?.payload?.preview
    || (type?.payload ? 'attachment' : 'none');
  const mode = declared === 'attachment' && !hasPayload ? 'none' : declared;
  return {
    mode,
    fileUrl: hasPayload ? instancePayloadFileUrl(attachment) : '',
    renderable: RENDERABLE_PREVIEW_MODES.includes(mode),
    hasPayload
  };
}
