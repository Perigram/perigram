export const DOCUMENTS_PREVIEW_FILE_MIMES = Object.freeze([
  'text/markdown',
  'text/html',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

export function isDocumentsPreviewValue(value) {
  if (!value || typeof value !== 'object') return false;
  if (['text.flow-document', 'document.report'].includes(value.type)) return true;
  return typeof value.payload?.base64 === 'string'
    && DOCUMENTS_PREVIEW_FILE_MIMES.includes(value.payload.mime);
}
