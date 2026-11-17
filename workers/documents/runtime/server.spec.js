import { describe, expect, it } from 'vitest';
import { createRuntime } from './server.mjs';
describe('Documents server runtime', () => {
  const runtime = createRuntime();
  it('extracts the first table from a flow document', () => {
    const rows = [{ sku: 'A-1', quantity: 2 }];
    expect(runtime.execute('extract-table', { document: { type: 'text.flow-document', schemaVersion: 1, blocks: [{ type: 'paragraph', children: [] }, { type: 'table', rows }] } })).toEqual(rows);
  });
  it('rejects values outside the flow-document contract', () => {
    expect(() => runtime.execute('extract-table', { document: { type: 'document.report', blocks: [] } })).toThrow(/text\.flow-document/);
  });
  it('rejects flow documents without a table', () => {
    expect(() => runtime.execute('extract-table', { document: { type: 'text.flow-document', blocks: [{ type: 'paragraph', children: [] }] } })).toThrow(/carries no table/);
  });
  it('rejects unknown operations', () => {
    expect(() => runtime.execute('render-html', {})).toThrow(/Unsupported Documents server operation/);
  });
});
