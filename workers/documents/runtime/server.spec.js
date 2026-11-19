// The server runtime's declared-operation inventory and the listing
// invariants the endpoint executor used to carry.
import { describe, expect, it } from 'vitest';
import { createRuntime } from './server.mjs';
import listing from '../listing.json';

describe('Documents server runtime', () => {
  const runtime = createRuntime();

  it('declares the server runtime beside the shared browser/server runtime', () => {
    expect(listing.declarations.runtimes).toEqual([
      expect.objectContaining({ id: 'documents-shared', targets: ['browser', 'server'] }),
      expect.objectContaining({ id: 'documents-server', targets: ['server'], entry: '/runtime/server.mjs' })
    ]);
    for (const service of listing.declarations.services.filter(item => item.execution?.runtime === 'documents-server')) {
      expect(service.execution.targets).toEqual(['server']);
      expect(service.execution.capabilities).toEqual([]);
    }
  });

  it('implements every operation declared for the server runtime', async () => {
    const declared = listing.declarations.services
      .filter(service => service.execution?.runtime === 'documents-server')
      .map(service => service.id)
      .sort();
    expect(declared).toEqual(['fill', 'render-document-pdf', 'render-pdf', 'render-report-pdf']);
    for (const id of declared) {
      await expect(runtime.execute(id, { refs: {}, draft: { data: {} } }), id)
        .rejects.toThrow(/requires a|accepts markdown/);
    }
    await expect(runtime.execute('unknown-op', {})).rejects.toThrow(/Unsupported Documents server operation/);
  });

  it('leaves no endpoint-mode service in the listing', () => {
    expect(listing.declarations.services.filter(service => service.mode === 'endpoint')).toEqual([]);
  });

  it('declares content revisions for every payload-bearing file type', () => {
    for (const type of listing.declarations.types.filter(type => type.class === 'file' && type.payload)) {
      expect(type.revisions, type.id).toBe('content');
    }
  });

  it('resolves every projection and construction binding to a declared service', () => {
    const serviceIds = new Set(listing.declarations.services.map(service => service.id));
    for (const type of listing.declarations.types) {
      for (const projection of type.projections || []) {
        expect(serviceIds.has(projection.resolve?.service?.replace('plugin.documents.', '')), `${type.id}/${projection.id}`).toBe(true);
      }
    }
    for (const [typeId, modes] of Object.entries(listing.declarations.constructions || {})) {
      expect(listing.declarations.types.some(type => type.id === typeId)).toBe(true);
      for (const serviceId of Object.values(modes)) {
        expect(serviceIds.has(String(serviceId).replace('plugin.documents.', '')), `${typeId} construction`).toBe(true);
      }
    }
  });
});
