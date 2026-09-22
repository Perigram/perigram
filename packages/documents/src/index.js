// The documents pack's declaration data (SPEC §21): browser-safe, no
// server imports. The generic media/office file types — the
// payload-trait replacements for the artifact kind registry's common
// kinds. Drawing/CAD formats (DXF, SVG) live in @perigram/tech-drawing.
// Mounting is by composition in server/packs/declarations.js.

const MB = 1024 * 1024;

function documentType({ id, mime, accept, maxSize, preview, icon, label, revisions = null, creation = null }) {
  return Object.freeze({
    id,
    class: 'file',
    scope: 'system',
    payload: { mime: [].concat(mime), accept, maxSize, preview, ...(creation ? { creation: [].concat(creation) } : {}) },
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
    label: 'Image',
    creation: ['upload', 'capture']
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
    mime: ['text/markdown'],
    accept: ['.md', 'text/markdown'],
    maxSize: 10 * MB,
    preview: 'text',
    icon: 'pi pi-file-edit',
    label: 'Text document',
    revisions: 'content',
    creation: ['editor']
  }),
  documentType({
    id: 'csv-table',
    mime: ['text/csv'],
    accept: ['.csv', 'text/csv'],
    maxSize: 10 * MB,
    preview: 'table',
    icon: 'pi pi-table',
    label: 'CSV table',
    revisions: 'content',
    creation: ['editor']
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
    // Word documents have no reasonable bounded preview: a faithful render
    // needs a paginated document surface, not a preview box. The payload
    // downloads instead.
    preview: 'download',
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
