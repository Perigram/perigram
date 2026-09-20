// The documents pack's declaration data (SPEC §21): browser-safe, no
// server imports. The generic document/media file types — the
// payload-trait replacements for the artifact kind registry's common
// kinds. Mounting is by composition in server/packs/declarations.js.

const MB = 1024 * 1024;

function documentType({ id, mime, accept, maxSize, preview, icon, label, revisions = null }) {
  return Object.freeze({
    id,
    class: 'file',
    scope: 'system',
    payload: { mime: [].concat(mime), accept, maxSize, preview },
    ...(revisions ? { revisions } : {}),
    fields: { name: { base: 'string' } },
    render: { label, icon }
  });
}

export const documentsTypes = Object.freeze([
  documentType({
    id: 'image',
    mime: ['image/jpeg', 'image/png'],
    accept: ['.jpg', '.jpeg', '.png', 'image/jpeg', 'image/png'],
    maxSize: 25 * MB,
    preview: 'image',
    icon: 'pi pi-image',
    label: 'Image'
  }),
  documentType({
    id: 'pdf-document',
    mime: ['application/pdf'],
    accept: ['.pdf', 'application/pdf'],
    maxSize: 25 * MB,
    preview: 'pdf',
    icon: 'pi pi-file-pdf',
    label: 'PDF document'
  }),
  documentType({
    id: 'text-document',
    mime: ['text/plain'],
    accept: ['.txt', 'text/plain'],
    maxSize: 10 * MB,
    preview: 'text',
    icon: 'pi pi-file-edit',
    label: 'Text document',
    revisions: 'content'
  }),
  documentType({
    id: 'csv-table',
    mime: ['text/csv'],
    accept: ['.csv', 'text/csv'],
    maxSize: 10 * MB,
    preview: 'table',
    icon: 'pi pi-table',
    label: 'CSV table',
    revisions: 'content'
  }),
  documentType({
    id: 'svg-file',
    mime: ['image/svg+xml'],
    accept: ['.svg', 'image/svg+xml'],
    maxSize: 10 * MB,
    preview: 'svg',
    icon: 'pi pi-code',
    label: 'SVG file'
  }),
  documentType({
    id: 'dxf-source',
    mime: ['application/dxf'],
    accept: ['.dxf', 'application/dxf'],
    maxSize: 50 * MB,
    preview: 'dxf',
    icon: 'pi pi-objects-column',
    label: 'DXF source'
  }),
  documentType({
    id: 'xlsx-workbook',
    mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    accept: ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    maxSize: 25 * MB,
    preview: 'workbook',
    icon: 'pi pi-file-excel',
    label: 'XLSX workbook'
  }),
  documentType({
    id: 'docx-document',
    mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    accept: ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxSize: 25 * MB,
    preview: 'docx',
    icon: 'pi pi-file-word',
    label: 'DOCX document'
  })
]);

// Editor bindings (SPEC §21): the shared text/csv editor saves through
// the revisioned instance payload transport; `revisions: 'content'` on
// the types is what makes them editor-replaceable.
export const documentsEditors = Object.freeze([
  { type: 'text-document', surface: 'text-editor', modes: ['edit'] },
  { type: 'csv-table', surface: 'csv-editor', modes: ['edit'] }
]);

export const documentsPack = Object.freeze({
  id: 'documents',
  label: 'Documents',
  requires: [],
  types: documentsTypes,
  editors: documentsEditors
});
