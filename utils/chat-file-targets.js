// Pure resolver for the chat composer's instance-chat upload window (the
// support feature README's Message Attachments contract): over the served
// CTS type view it collects a composer target's declared `file`-class
// children whose payload traits and `upload` creation protocol accept a
// given file. The server re-validates every send — this is only the early
// check that gates the composer's file input.
import { payloadAccepts } from '~/packages/cts/src/index.js';

const legacySpelling = (value) => String(value || '').replace(/_/g, '-').toLowerCase();

/**
 * Upload-accepting file children of a composer target type, in declaration
 * order. `typeById` resolves child type records from the same served view
 * (kebab/snake spellings normalize like every other display seam).
 */
export function chatFileChildCandidates({ typeRecord = null, typeById = () => null } = {}) {
  if (!typeRecord || typeRecord.class === 'party') return [];
  const candidates = [];
  const seen = new Set();
  for (const edge of Object.values(typeRecord?.edges?.children || {})) {
    for (const typeId of [].concat(edge?.types || [])) {
      if (seen.has(typeId)) continue;
      seen.add(typeId);
      const child = typeById(typeId) || typeById(legacySpelling(typeId));
      if (!child || child.class !== 'file' || !child.payload) continue;
      const creation = [].concat(child.payload.creation || ['upload']);
      if (!creation.includes('upload')) continue;
      candidates.push({
        typeId: child.id,
        label: child.name || child.id,
        glyph: child.glyph || null,
        accept: [...new Set([]
          .concat(child.payload.accept || [])
          .concat(child.payload.mime || [])
          .filter(Boolean))],
        payload: child.payload
      });
    }
  }
  return candidates;
}

/**
 * The union `accept` string for the composer's file input: every accepted
 * MIME type and extension across the candidate set. An instance chat with
 * no candidates refuses uploads at pick time — empty string means "do not
 * offer the picker at all".
 */
export function chatFileAccept(candidates = []) {
  return [...new Set(candidates.flatMap(candidate => candidate.accept))].join(',');
}

/**
 * Candidates that accept one concrete file (browser File shape:
 * `type` MIME string, `size` bytes). Empty means refused at selection.
 */
export function chatFileCandidatesForFile(candidates = [], { type = '', size = null } = {}) {
  return candidates.filter(candidate => payloadAccepts(candidate.payload, { mime: type || null, size }));
}

/**
 * The first candidate accepting a voice recording: MediaRecorder produces
 * webm (default), mp4, or ogg depending on the browser. Null means the
 * instance chat refuses voice messages at pick time.
 */
export function chatVoiceFileCandidate(candidates = []) {
  const recordingMimes = ['audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find(candidate => recordingMimes.some(mime => payloadAccepts(candidate.payload, { mime }))) || null;
}

/**
 * Chat attachment kind from the file's MIME family; unknown types degrade
 * to the generic file chip (rendering keys, not storage).
 */
export function chatAttachmentKind(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * Streaming/download URL for a stored attachment descriptor, honoring the
 * legacy `uploads` bucket marker; new descriptors live in `files`.
 */
export function chatAttachmentUrl(attachment = {}, { download = false } = {}) {
  const fileId = attachment?.fileId ? encodeURIComponent(String(attachment.fileId)) : '';
  if (!fileId) return '';
  const bucket = attachment.bucket === 'uploads' ? 'uploads' : 'files';
  return `/api/files/download/${fileId}?bucket=${bucket}${download ? '&download=1' : ''}`;
}
