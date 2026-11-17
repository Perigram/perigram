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
 * The wire `payload` slot supplies the payload reference. Returns
 * `{ mode, fileUrl, renderable, hasPayload }`; a null type or a type
 * without payload policy resolves mode `'none'`.
 */
export function resolveFilePreview(entity = {}, type = null) {
  const attachment = entity?.payload || null;
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

// The peek sniffers are mime-first with extension fallbacks for the
// octet-stream uploads browsers label loosely; office containers stay
// downloads (mime-exact matching, the chat viewer's rule).
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)$/i;
const TEXT_EXT = /\.(md|txt|csv|json|ya?ml|log)$/i;

function sniffedPeekMode(mime = '', name = '') {
  if (mime === 'image/svg+xml' || /\.svg$/i.test(name)) return 'svg';
  if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (mime.includes('pdf') || /\.pdf$/i.test(name)) return 'pdf';
  if (mime.startsWith('text/') || /^application\/(json|xml|yaml|x-yaml)(;|$)/i.test(mime)) return 'text';
  if (/\.dxf$/i.test(name)) return 'dxf';
  if (mime === 'application/octet-stream' && TEXT_EXT.test(name)) return 'text';
  return null;
}

/**
 * Pure hover-peek decision for a bare file descriptor (chat attachments,
 * generator blobs): `{ mode, fileUrl }` for the shared payload viewer, or
 * null when the file has no renderable peek mode. The URL honors the
 * legacy `uploads` bucket marker like every stored-attachment consumer.
 */
export function parsePluginPreviewPayload(text, mime = '') {
  const source = String(text ?? '');
  if (String(mime).toLowerCase() === 'text/html') {
    return { type: 'html-document', mime: 'text/html', text: source };
  }
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

export function resolveAttachmentPeek(attachment = {}) {
  if (!attachment?.fileId) return null;
  const mime = String(attachment.mime || attachment.mimeType || '');
  const name = String(attachment.name || '');
  const mode = sniffedPeekMode(mime, name);
  if (!mode) return null;
  const bucket = attachment.bucket === 'uploads' ? 'uploads' : PAYLOAD_BUCKET;
  return {
    mode,
    fileUrl: `/api/files/download/${encodeURIComponent(String(attachment.fileId))}?bucket=${bucket}`
  };
}
