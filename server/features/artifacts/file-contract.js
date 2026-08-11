import { createError } from 'h3';

export function validateArtifactFile(kind = {}, { buffer, filename = '', mimeType = '' } = {}) {
  const rule = kind.file || {};
  if (!buffer?.length) throw createError({ statusCode: 400, message: 'Artifact file is required' });
  if (rule.maxBytes && buffer.length > rule.maxBytes) {
    throw createError({ statusCode: 413, message: `Artifact file exceeds the ${Math.floor(rule.maxBytes / 1024 / 1024)} MB limit` });
  }
  const extension = String(filename).toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  if (rule.extensions?.length && !rule.extensions.includes(extension)) {
    throw createError({ statusCode: 400, message: `Artifact file must use ${rule.extensions.join(', ')}` });
  }
  const declared = String(mimeType || '').toLowerCase();
  if (rule.mimeTypes?.length && declared && !rule.mimeTypes.includes(declared) && declared !== 'application/octet-stream') {
    throw createError({ statusCode: 400, message: 'Artifact file MIME type is not allowed for this kind' });
  }
}
