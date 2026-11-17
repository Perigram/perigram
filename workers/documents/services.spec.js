// The extraction services' payload contract: a composed value service
// receives the hydrated blob handle under `payload`; a projection
// receives the envelope's top-level base64. One normalizer serves both.
import { describe, expect, it } from 'vitest';
import { services } from './services.js';
import listing from './listing.json';

const CSV = Buffer.from('name,qty\naluminium,12\nsteel,3\n').toString('base64');
const XLSX_BASE64 = await (async () => {
  // Build a real workbook through the same library the service reads.
  const XLSX = await import('xlsx/xlsx.mjs');
  const sheet = XLSX.utils.aoa_to_sheet([['name', 'qty'], ['aluminium', 12], ['steel', 3]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return Buffer.from(bytes).toString('base64');
})();

const composed = payload => ({ payload });
const projection = payloadBase64 => ({ payloadBase64 });

describe('documents listing/runtime inventory', () => {
  it('endpoint executor exposes only endpoint-mode operations', async () => {
    const { endpointServices } = await import('./services.js');
    expect(Object.keys(endpointServices).sort()).toEqual(
      listing.declarations.services.filter(service => service.mode === 'endpoint').map(service => service.id).sort()
    );
  });

  it('declares content revisions for every payload-bearing file type', () => {
    for (const type of listing.declarations.types.filter(type => type.class === 'file' && type.payload)) {
      expect(type.revisions).toBe('content');
    }
  });

  it('implements every endpoint service exactly once', () => {
    expect(Object.keys(services).sort()).toEqual(
      listing.declarations.services.filter(service => service.mode === 'endpoint').map(service => service.id).sort()
    );
  });

  it('resolves every projection and construction binding to a declared service', () => {
    const serviceIds = new Set(listing.declarations.services.map(service => service.id));
    for (const type of listing.declarations.types) {
      for (const projection of type.projections || []) {
        expect(serviceIds.has(projection.resolve?.service?.replace('plugin.documents.', ''))).toBe(true);
      }
    }
    for (const [typeId, modes] of Object.entries(listing.declarations.constructions || {})) {
      expect(listing.declarations.types.some(type => type.id === typeId)).toBe(true);
      for (const serviceId of Object.values(modes)) {
        expect(serviceIds.has(String(serviceId).replace('plugin.documents.', ''))).toBe(true);
      }
    }
  });
});

describe('documents extraction payload contract', () => {
  it('table-rows reads a composed blob handle and a projection envelope alike', async () => {
    const fromHandle = await services['table-rows'](composed({
      fileId: 'f-1', mime: 'text/csv', size: 26, payloadBase64: CSV
    }));
    const fromEnvelope = await services['table-rows'](projection(CSV));
    expect(fromHandle).toEqual(fromEnvelope);
    expect(fromHandle).toEqual([
      { name: 'aluminium', qty: 12 },
      { name: 'steel', qty: 3 }
    ]);
  });

  it('table-rows parses xlsx payloads through the composed handle', async () => {
    const rows = await services['table-rows'](composed({
      fileId: 'f-2', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 100, payloadBase64: XLSX_BASE64
    }));
    expect(rows).toEqual([
      { name: 'aluminium', qty: 12 },
      { name: 'steel', qty: 3 }
    ]);
  });

  it('table-cells reads the positional decomposition through the composed handle', async () => {
    const cells = await services['table-cells'](composed({
      fileId: 'f-1', mime: 'text/csv', size: 26, payloadBase64: CSV
    }));
    expect(cells[0]).toEqual({ A: 'name', B: 'qty' });
    expect(cells).toHaveLength(3);
  });

  it('text decodes the composed handle bytes', async () => {
    const text = await services.text(composed({
      fileId: 'f-3', mime: 'text/plain', size: 5, payloadBase64: Buffer.from('hello').toString('base64')
    }));
    expect(text).toBe('hello');
  });



  it('refuses a payload-less dispatch naming the service', async () => {
    await expect(services['table-rows']({})).rejects.toThrow('requires a payload');
    await expect(services.text({ payload: { fileId: 'f-x' } })).rejects.toThrow('requires a payload');
  });
});
