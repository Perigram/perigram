import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../features/instances/service.js', () => ({
  instanceServiceResolver: vi.fn()
}));
vi.mock('../../../features/files/service.js', () => ({
  getFileBuffer: vi.fn(async () => Buffer.from('name,width\nTray A,600\n'))
}));

import { instanceServiceResolver } from '../../../features/instances/service.js';
import { tableRows } from './table-rows.js';

// The projection reads the §3 wire DTO: the payload lives in the
// top-level `payload` slot (owner decision 2026-10-11) — the retired
// `attachments.primary` spelling resolves nothing.
describe('table projection payload resolution', () => {
  function serveTable(table) {
    instanceServiceResolver.mockReturnValue({ getById: async () => table });
  }

  it('reads rows from the top-level payload slot', async () => {
    serveTable({ _id: 't1', type: 'csv-table', payload: { fileId: 'f1', mime: 'text/csv' } });
    await expect(tableRows({ type: 'csv-table', id: 't1' })).resolves.toEqual([
      { name: 'Tray A', width: 600 }
    ]);
  });

  it('refuses a table with no payload', async () => {
    serveTable({ _id: 't1', type: 'csv-table' });
    await expect(tableRows({ type: 'csv-table', id: 't1' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('carries no payload') });
  });

  it('does not resolve the retired attachments.primary spelling', async () => {
    serveTable({ _id: 't1', type: 'csv-table', attachments: { primary: { fileId: 'f1' } } });
    await expect(tableRows({ type: 'csv-table', id: 't1' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('carries no payload') });
  });
});
