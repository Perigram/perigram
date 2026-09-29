// The documents pack's server mount (SPEC §21): the pack's types ride the
// generic instance machinery and carry no services — the one binding is
// the `rows` projection handler (SPEC §8 p extract): the entity→value
// gate that turns a table instance into header-keyed row values.
// Declaration data lives in `packages/documents`; browser-safe.
import { tableRows } from './projections/table-rows.js';

export const documentsPack = {
  id: 'documents',
  label: 'Documents',
  domain: { id: 'documents', label: 'Documents' },
  projectionHandlers: {
    'documents.tableRows': tableRows
  }
};
