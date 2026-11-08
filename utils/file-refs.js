import { parseFileHref } from '#shared/markdown.js';

const MIME_BY_EXTENSION = {
  avif: 'image/avif',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dxf: 'image/vnd.dxf',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  md: 'text/markdown',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip'
};

export function mimeTypeForName(name = '') {
  const extension = String(name).split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXTENSION[extension] || '';
}

export function fileIdFromHref(href = '') {
  const match = /\/api\/files\/download\/([^/?#]+)/.exec(String(href));
  return match ? decodeURIComponent(match[1]) : '';
}

// The FileChip descriptor for a stored or addressed file reference.
export function fileRefDescriptor({ href = '', name = '' } = {}) {
  const parsed = parseFileHref(href) || { href };
  const label = String(name || parsed.href.split('/').pop() || parsed.href);
  const fileId = fileIdFromHref(parsed.href);
  return {
    name: label,
    mimeType: mimeTypeForName(label),
    url: parsed.href,
    ...(fileId ? { fileId, bucket: 'files' } : {})
  };
}
