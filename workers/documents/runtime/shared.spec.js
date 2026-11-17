import { describe, expect, it } from 'vitest';
import { createRuntime } from './shared.mjs';
import listing from '../listing.json';

describe('Documents shared runtime', () => {
  const runtime = createRuntime();

  it('declares pure document and CSV operations for browser and server', () => {
    expect(listing.declarations.runtimes).toEqual([
      expect.objectContaining({ id: 'documents-shared', targets: ['browser', 'server'] })
    ]);
    for (const service of listing.declarations.services.filter(item => item.execution?.runtime === 'documents-shared')) {
      expect(service.execution.targets).toEqual(['browser', 'server']);
      expect(service.execution.capabilities).toEqual([]);
    }
  });

  it('implements every operation declared for the shared Documents runtime', () => {
    const inline = { type: 'text', text: 'Hello' };
    const paragraph = { type: 'paragraph', children: [inline] };
    const document = { type: 'text.flow-document', schemaVersion: 1, blocks: [{ type: 'table', rows: [{ value: '1' }] }] };
    const report = { type: 'document.report', schemaVersion: 1, sections: [{ blocks: [{ type: 'flow', document }] }] };
    const cases = [
      ['table-rows', { typeId: 'csv-table', payloadBase64: 'bmFtZSxxdHkKYWx1bWluaXVtLDEyCg==' }],
      ['table-cells', { typeId: 'csv-table', payloadBase64: 'bmFtZSxxdHkKYWx1bWluaXVtLDEyCg==' }],
      ['text', { payloadBase64: 'aGVsbG8=' }],
      ['csv-text', { rows: [{ value: '1' }] }],
      ['export-markdown', { document }],
      ['compose-report', { rows: [{ value: '1' }] }],
      ['extract-table', { document }],
      ['render-html', { report }],
      ['inline-text', { text: 'Hello' }],
      ['inline-mark', { mark: 'strong', children: [inline] }],
      ['inline-link', { href: 'https://example.com', children: [inline] }],
      ['document-paragraph', { children: [inline] }],
      ['document-heading', { text: 'Hello', level: 1 }],
      ['document-list', { items: ['Hello'] }],
      ['document-table', { rows: [{ value: '1' }] }],
      ['document-quote', { blocks: [paragraph] }],
      ['document-code-block', { text: 'const x = 1;' }],
      ['document-divider', {}],
      ['compose-document', { blocks: [paragraph] }],
      ['append-document-block', { document: { type: 'text.flow-document', blocks: [] }, block: paragraph }],
      ['render-document-html', { document }],
      ['export-markdown-file', { document }],
      ['export-html-file', { document }]
    ];
    const declared = listing.declarations.services
      .filter(service => service.execution?.runtime === 'documents-shared')
      .map(service => service.id)
      .sort();
    expect(cases.map(([id]) => id).sort()).toEqual(declared);
    for (const [id, input] of cases) {
      expect(runtime.execute(id, input), id).toBeDefined();
    }
  });

  it('projects CSV rows from both hydrated payload handles and projection envelopes', () => {
    const base64 = 'bmFtZSxxdHkKYWx1bWluaXVtLDEyCnN0ZWVsLDMK';
    const handle = runtime.execute('table-rows', { payload: { mime: 'text/csv', payloadBase64: base64 } });
    const envelope = runtime.execute('table-rows', { typeId: 'csv-table', payloadBase64: base64 });
    expect(handle).toEqual(envelope);
    expect(handle).toEqual([{ name: 'aluminium', qty: 12 }, { name: 'steel', qty: 3 }]);
  });

  it('projects positional spreadsheet rows with stable column keys', () => {
    const rows = runtime.execute('table-cells', {
      typeId: 'csv-table',
      payloadBase64: 'bmFtZSxxdHkKYWx1bWluaXVtLDEyCnN0ZWVsLDMK'
    });
    expect(rows).toEqual([
      { A: 'name', B: 'qty' },
      { A: 'aluminium', B: 12 },
      { A: 'steel', B: 3 }
    ]);
  });

  it('reads XLSX payload bytes in the shared runtime', async () => {
    const XLSX = await import('../assets/vendor/xlsx.mjs');
    const sheet = XLSX.utils.aoa_to_sheet([['name', 'qty'], ['aluminium', 12], ['steel', 3]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const binary = Array.from(new Uint8Array(bytes), byte => String.fromCharCode(byte)).join('');
    const rows = runtime.execute('table-rows', { typeId: 'xlsx-workbook', payloadBase64: btoa(binary) });
    expect(rows).toEqual([{ name: 'aluminium', qty: 12 }, { name: 'steel', qty: 3 }]);
  });

  it('extracts document text from a payload envelope', () => {
    expect(runtime.execute('text', { payloadBase64: 'aGVsbG8=' })).toBe('hello');
  });

  it('rejects missing and unreadable projection payloads with actionable errors', () => {
    expect(() => runtime.execute('text', {})).toThrow('requires a payload with payloadBase64');
    expect(() => runtime.execute('table-rows', { typeId: 'csv-table', payloadBase64: 'not-base64!!' })).toThrow();
  });

  it('serializes row records through the shared spreadsheet engine', () => {
    const csv = runtime.execute('csv-text', { rows: [{ name: 'Panel', width: 600 }, { name: 'Door', width: 450 }] });
    expect(csv).toContain('name,width');
    expect(csv).toContain('Panel,600');
    expect(csv).toContain('Door,450');
    expect(() => runtime.execute('csv-text', { rows: {} })).toThrow(/rows array/);
  });

  it('declares text list items optional when formatted inline items are wired', () => {
    const list = listing.declarations.services.find(service => service.id === 'document-list');
    expect(list.signature.input.fields.items).toMatchObject({ base: 'list', nullable: true, label: 'Text items' });
    expect(list.signature.input.fields.inlineItems).toMatchObject({
      base: 'list',
      nullable: true,
      label: 'Formatted items',
      itemType: { base: 'json', kind: 'text.inline' }
    });
  });

  it('builds typed inline values, blocks, and a flow document from graph operations', () => {
    const text = runtime.execute('inline-text', { text: 'Hello' });
    const strong = runtime.execute('inline-mark', { mark: 'strong', children: [text] });
    const heading = runtime.execute('document-heading', { level: 1, children: [strong] });
    const paragraph = runtime.execute('document-paragraph', { text: 'A paragraph' });
    const table = runtime.execute('document-table', { rows: [{ sku: 'A-1', quantity: 2 }] });
    const document = runtime.execute('compose-document', { title: 'Parts', blocks: [heading, paragraph, table] });
    expect(document).toMatchObject({ type: 'text.flow-document', title: 'Parts', blocks: [{ type: 'heading' }, { type: 'paragraph' }, { type: 'table' }] });
    expect(runtime.execute('append-document-block', { document, block: runtime.execute('document-divider', {}) }).blocks).toHaveLength(4);
  });

  it('rejects malformed document blocks and unsafe links', () => {
    expect(() => runtime.execute('document-heading', { level: 7, text: 'Bad' })).toThrow(/level/);
    expect(() => runtime.execute('compose-document', { blocks: [{ type: 'record' }] })).toThrow(/text.document-block/);
    expect(() => runtime.execute('inline-link', { href: 'javascript:alert(1)', children: [{ type: 'text', text: 'x' }] })).toThrow(/safe/);
  });

  it('exports composed documents as actual Markdown and HTML file payloads', () => {
    const document = runtime.execute('compose-document', { title: 'Parts', blocks: [runtime.execute('document-heading', { text: 'Ready', level: 2 })] });
    const markdown = runtime.execute('export-markdown-file', { document });
    const html = runtime.execute('export-html-file', { document });
    expect(markdown.payload.mime).toBe('text/markdown');
    expect(markdown.payload.name).toBe('Parts.md');
    expect(Buffer.from(markdown.payload.base64, 'base64').toString()).toContain('## Ready');
    expect(html.payload.mime).toBe('text/html');
    expect(Buffer.from(html.payload.base64, 'base64').toString()).toContain('<h2>Ready</h2>');
  });

  it('declares a download-only HTML file type for exported HTML payloads', () => {
    const html = listing.declarations.types.find(type => type.id === 'html-document');
    expect(html).toMatchObject({
      class: 'file',
      payload: {
        mime: ['text/html'],
        accept: ['.html', '.htm', 'text/html'],
        preview: 'download'
      },
      revisions: 'content'
    });
    expect(listing.declarations.services.find(service => service.id === 'export-html-file').signature.output)
      .toMatchObject({ base: 'json', kind: 'documents.file' });
    expect(html.projections).toEqual([expect.objectContaining({
      id: 'text',
      output: { base: 'string' },
      resolve: { service: 'plugin.documents.text' }
    })]);
  });

  it('renders a flow document directly as safe HTML', () => {
    const html = runtime.execute('render-document-html', { document: { type: 'text.flow-document', blocks: [{ type: 'paragraph', children: [{ type: 'text', text: '<safe>' }] }] } });
    expect(html).toContain('&lt;safe&gt;');
  });

  it('extracts tables and composes reports from typed documents', () => {
    const rows = [{ sku: 'A-1', quantity: 2 }];
    const document = { type: 'text.flow-document', schemaVersion: 1, blocks: [{ type: 'table', rows }] };
    expect(runtime.execute('extract-table', { document })).toEqual(rows);
    expect(runtime.execute('compose-report', { title: 'Parts', rows })).toMatchObject({ type: 'document.report', title: 'Parts' });
  });

  it('renders escaped standalone HTML from report IR', () => {
    const html = runtime.execute('render-html', { report: { type: 'document.report', sections: [{ blocks: [{ type: 'paragraph', children: [{ type: 'text', text: '<script>' }] }] }] } });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('exports flow documents to Markdown and rejects unknown operations', () => {
    expect(runtime.execute('export-markdown', { document: { type: 'text.flow-document', blocks: [{ type: 'heading', level: 2, children: [{ type: 'text', text: 'Parts' }] }, { type: 'paragraph', children: [{ type: 'text', text: 'Ready' }] }] } })).toBe('## Parts\n\nReady\n');
    expect(() => runtime.execute('unknown-operation', {})).toThrow(/Unsupported Documents shared operation/);
  });
});
