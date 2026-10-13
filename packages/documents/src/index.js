// The documents pack's declaration data (SPEC §21): browser-safe, no
// server imports. The generic media/office file types — the
// payload-trait replacements for the artifact kind registry's common
// kinds. Drawing/CAD formats (DXF, SVG) live in @perigram/tech-drawing.
// Mounting is by composition in server/packs/declarations.js.

const MB = 1024 * 1024;

// The table types' declared projections (SPEC §8 p extract): instance →
// row records. Resolve is the pack-mounted handler pair in
// `server/packs/documents/table-rows.js` (payload parse; header-keyed or
// positional conversion); column semantics are the reading graph's
// authoring. The `tableData` group is the pack's palette section: the
// plugin-tab law — xlsx/csv table decomposition, composition, and
// management of TABLE data live in their own tab, like a Grasshopper
// plugin's component category.
const rowsProjection = {
  id: 'rows',
  label: 'Table rows',
  group: 'tableData',
  output: { base: 'list', itemType: { base: 'record' } },
  resolve: { handler: 'documents.tableRows' }
};
// The positional twin for sheets without column names: every row is data,
// keys are spreadsheet column letters (`A`, `B`, …) — `Record field` path
// `A` is the positional column read.
const cellsProjection = {
  id: 'cells',
  label: 'Table cells (positional)',
  group: 'tableData',
  output: { base: 'list', itemType: { base: 'record' } },
  resolve: { handler: 'documents.tableCells' }
};
const tableProjections = Object.freeze([rowsProjection, cellsProjection]);

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
    creation: ['editor', 'content']
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
    creation: ['editor', 'content'],
    projections: tableProjections
  }),
  documentType({
    id: 'xlsx-workbook',
    mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    accept: ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    maxSize: 25 * MB,
    preview: 'workbook',
    glyph: 'pi pi-file-excel',
    name: 'XLSX workbook',
    creation: ['upload'],
    projections: tableProjections
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
// the types is what makes them editor-replaceable. A workbook has no
// bespoke editor: its authoring act is being read by process graphs
// through the declared `rows` projection (SPEC §8 p extract).
export const documentsEditors = Object.freeze([
  { type: 'text-document', surface: 'text-editor', modes: ['edit'] },
  { type: 'csv-table', surface: 'csv-editor', modes: ['edit'] }
]);

// The pack's one value service (SPEC §8 s species): the composition twin
// of the `rows` decomposition — rows back into CSV text. The command is
// declared once here; the pack mount binds its handler
// (server/packs/documents/value-services/csv-text.js).
export const documentsCommands = Object.freeze({
  'documents.csvText': Object.freeze({
    id: 'documents.csvText',
    service: 'documents',
    action: 'csvText',
    label: 'CSV text',
    input: { parameters: [{ name: 'rows', type: 'array', required: true }] },
    output: { data: [{ name: 'text', type: 'string' }] }
  })
});

export const documentsServices = Object.freeze([Object.freeze({
  id: 'documents.csvText',
  command: 'documents.csvText',
  group: 'tableData',
  render: Object.freeze({ label: 'CSV text', icon: 'pi pi-table' }),
  signature: Object.freeze({
    input: Object.freeze({
      base: 'record',
      fields: Object.freeze({ rows: Object.freeze({ base: 'list', itemType: Object.freeze({ base: 'record' }) }) })
    }),
    output: Object.freeze({ base: 'string' })
  })
})]);

export const documentsPack = Object.freeze({
  id: 'documents',
  label: 'Documents',
  requires: [],
  types: documentsTypes,
  editors: documentsEditors,
  services: documentsServices,
  domain: Object.freeze({ commands: documentsCommands })
});
