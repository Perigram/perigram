import { describe, expect, it } from 'vitest';
import { createRuntime } from './browser.mjs';
import listing from '../listing.json';

describe('Documents browser runtime', () => {
  it('declares CSV serialization as a browser-managed pure operation', () => {
    const service = listing.declarations.services.find(item => item.id === 'csv-text');
    expect(listing.declarations.runtimes.find(runtime => runtime.id === 'documents-browser').targets)
      .toEqual(['browser']);
    expect(service.mode).toBeUndefined();
    expect(service.execution).toMatchObject({
      runtime: 'documents-browser',
      kind: 'pure',
      targets: ['browser'],
      capabilities: []
    });
  });

  it('serializes row records through the bundled spreadsheet engine', () => {
    const runtime = createRuntime();
    const csv = runtime.execute('csv-text', {
      rows: [{ name: 'Panel', width: 600 }, { name: 'Door', width: 450 }]
    });
    expect(csv).toContain('name,width');
    expect(csv).toContain('Panel,600');
    expect(csv).toContain('Door,450');
  });

  it('rejects unknown operations and invalid row inputs', () => {
    const runtime = createRuntime();
    expect(() => runtime.execute('fill', {})).toThrow(/Unsupported Documents browser operation/);
    expect(() => runtime.execute('csv-text', { rows: {} })).toThrow(/rows array/);
  });
});
