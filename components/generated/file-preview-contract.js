// File payload preview contract: the pure half of the file-surface
// decision helpers. Kept free of
// component imports so card/preview surfaces resolve payload preview
// policy without pulling the editor-surface registry graph.
import { RENDERABLE_PREVIEW_MODES } from '#shared/ui-mapping/index.js';
import { GRAPH_DOCUMENT_EXTENSION } from '#packages/cts';

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

// The graph extension wins before mime; other peeks are mime-first with
// extension fallbacks for octet-stream uploads.
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)$/i;
const TEXT_EXT = /\.(md|txt|csv|json|ya?ml|log)$/i;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sniffedPeekMode(mime = '', name = '') {
  if (String(name).toLowerCase().endsWith(GRAPH_DOCUMENT_EXTENSION)) return 'graph';
  if (mime === 'image/svg+xml' || /\.svg$/i.test(name)) return 'svg';
  if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (mime.includes('pdf') || /\.pdf$/i.test(name)) return 'pdf';
  if (mime === XLSX_MIME) return 'workbook';
  if (mime === DOCX_MIME) return 'docx';
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

/**
 * Preview decision for an in-memory file payload (`{ payload: { base64,
 * mime, name } }`, the plugin graph-output envelope): a data URL plus the
 * mime-sniffed preview mode, so graph outputs render through the same
 * viewer as stored files. Returns null when the bytes cannot be previewed.
 */
export function resolveInlinePayloadPreview(value = {}) {
  const payload = value?.payload;
  if (!payload || typeof payload.base64 !== 'string' || !payload.base64) return null;
  const mime = String(payload.mime || '');
  const name = String(payload.name || '');
  const mode = sniffedPeekMode(mime, name);
  if (!mode || !RENDERABLE_PREVIEW_MODES.includes(mode)) return null;
  return {
    mode,
    fileUrl: `data:${mime || 'application/octet-stream'};base64,${payload.base64}`,
    attachment: payload
  };
}
