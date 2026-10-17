// The documents pack's server mount (SPEC §21): the pack's types ride the
// generic instance machinery and carry no services — the bindings are the
// `rows` projection handler (SPEC §8 p extract): the entity→value gate
// that turns a table instance into header-keyed row values — and the one
// value-service command (SPEC §8 s species): rows back into CSV text.
// Declaration data lives in `packages/documents`; browser-safe.
import { documentsCommands } from '#packages/documents/src/index.js';
import { tableRows, tableCells, textOf } from './projections/table-rows.js';
import { csvText } from './value-services/csv-text.js';

export const documentsPack = {
  id: 'documents',
  label: 'Documents',
  domain: { id: 'documents', label: 'Documents', commands: documentsCommands },
  projectionHandlers: {
    'documents.tableRows': tableRows,
    'documents.tableCells': tableCells,
    'documents.text': textOf
  },
  commandHandlers: {
    'documents.csvText': async ({ parameters }) => csvText(parameters.rows)
  }
};
