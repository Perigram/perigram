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

describe('documents template fill payload contract', () => {
  it('fills a Markdown file produced by the document graph as a real template', async () => {
    const template = Buffer.from('# {title}\n\nHello {name}.\n');
    const result = await services.fill({
      refs: {
        template: {
          payloadBase64: template.toString('base64'),
          payloadMime: 'text/markdown',
          name: 'welcome-template.md'
        }
      },
      draft: { data: { name: 'welcome', values: { title: 'Welcome', name: 'Ada' } } }
    });
    expect(result.payload.mime).toBe('text/markdown');
    expect(result.payload.name).toBe('welcome.md');
    expect(Buffer.from(result.payload.base64, 'base64').toString()).toBe('# Welcome\n\nHello Ada.\n');
    expect(result.meta.tokens).toEqual(['title', 'name']);
  });
});
