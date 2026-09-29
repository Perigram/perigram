// The documents pack's declaration data (SPEC §21): browser-safe, no
// server imports. The generic media/office file types — the
// payload-trait replacements for the artifact kind registry's common
// kinds. Drawing/CAD formats (DXF, SVG) live in @perigram/tech-drawing.
// Mounting is by composition in server/packs/declarations.js.

const MB = 1024 * 1024;

// The table types' declared projection (SPEC §8 p extract): instance →
// header-keyed row records. Resolve is the pack-mounted
// `documents.tableRows` handler (payload parse); column semantics are the
// reading graph's authoring.
const rowsProjection = Object.freeze([{
  id: 'rows',
  label: 'Table rows',
  output: { base: 'list', itemType: { base: 'record' } },
  resolve: { handler: 'documents.tableRows' }
}]);

function documentType({ id, mime, accept, maxSize, preview, glyph, name, revisions = null, creation = null, projections = null }) {
  return Object.freeze({
    id,
    class: 'file',
    scope: 'system',
    name,
    ...(glyph ? { glyph } : {}),
    payload: { mime: [].concat(mime), accept, maxSize, preview, ...(creation ? { creation: [].concat(creation) } : {}) },
    ...(revisions ? { revisions } : {}),
    ...(projections ? { projections } : {}),
    fields: { name: { base: 'string', identifier: true } }
  });
}

export const documentsTypes = Object.freeze([
  documentType({
    id: 'image',
    mime: ['image/jpeg', 'image/png'],
    accept: ['.jpg', '.jpeg', '.png', 'image/jpeg', 'image/png'],
    maxSize: 25 * MB,
    preview: 'image',
    glyph: 'pi pi-image',
    name: 'Image',
    creation: ['upload', 'capture']
  }),
  documentType({
    id: 'pdf-document',
    mime: ['application/pdf'],
    accept: ['.pdf', 'application/pdf'],
    maxSize: 25 * MB,
    preview: 'pdf',
    glyph: 'pi pi-file-pdf',
    name: 'PDF document'
  }),
  documentType({
    id: 'text-document',
    mime: ['text/markdown'],
    accept: ['.md', 'text/markdown'],
    maxSize: 10 * MB,
    preview: 'text',
    glyph: 'pi pi-file-edit',
    name: 'Text document',
    revisions: 'content',
    creation: ['editor']
  }),
  documentType({
    id: 'csv-table',
    mime: ['text/csv'],
    accept: ['.csv', 'text/csv'],
    maxSize: 10 * MB,
    preview: 'table',
    glyph: 'pi pi-table',
    name: 'CSV table',
    revisions: 'content',
    creation: ['editor'],
    projections: rowsProjection
  }),
  documentType({
    id: 'xlsx-workbook',
    mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    accept: ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    maxSize: 25 * MB,
    preview: 'workbook',
    glyph: 'pi pi-file-excel',
    name: 'XLSX workbook',
    revisions: 'content',
    projections: rowsProjection
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
    glyph: 'pi pi-file-word',
    name: 'DOCX document'
  })
]);

// Editor bindings (SPEC §21): the shared text/csv editor saves through
// the revisioned instance payload transport; `revisions: 'content'` on
// the types is what makes them editor-replaceable. The workbook's editor
// is the import mapper (see the table-import surface in
// components/generated/file-surfaces.js): a workbook's authoring act is
// becoming typed instances.
export const documentsEditors = Object.freeze([
  { type: 'text-document', surface: 'text-editor', modes: ['edit'] },
  { type: 'csv-table', surface: 'csv-editor', modes: ['edit'] },
  { type: 'xlsx-workbook', surface: 'table-import', modes: ['edit'] }
]);

export const documentsPack = Object.freeze({
  id: 'documents',
  label: 'Documents',
  requires: [],
  types: documentsTypes,
  editors: documentsEditors
});
