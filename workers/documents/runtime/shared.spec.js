import { describe, expect, it, vi } from 'vitest';
import { createRuntime } from './shared.mjs';
import * as XLSX from '../assets/vendor/xlsx.mjs';
import listing from '../listing.json';

describe('Documents shared runtime', () => {
  const runtime = createRuntime();

  it('declares browser and server runtime operations with explicit read capabilities', () => {
    expect(listing.declarations.runtimes).toEqual([
      expect.objectContaining({ id: 'documents-shared', targets: ['browser', 'server'] })
    ]);
    for (const service of listing.declarations.services.filter(item => item.execution?.runtime === 'documents-shared')) {
      expect(service.execution.targets).toEqual(['browser', 'server']);
      expect(service.execution.capabilities).toEqual(
        ['read-file', 'read-text-file', 'read-table-rows', 'read-table-cells'].includes(service.id)
          ? ['files.read']
          : []
      );
    }
  });

  it('implements every operation declared for the shared Documents runtime', async () => {
    const inline = { type: 'text', text: 'Hello' };
    const paragraph = { type: 'paragraph', children: [inline] };
    const document = { type: 'text.flow-document', schemaVersion: 1, blocks: [{ type: 'table', rows: [{ value: '1' }] }] };
    const report = { type: 'document.report', schemaVersion: 1, sections: [{ blocks: [{ type: 'flow', document }] }] };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Hello {name}']]), 'Sheet1');
    const workbookBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const workbookTemplate = {
      payload: {
        base64: Buffer.from(workbookBytes).toString('base64'),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        name: 'template.xlsx'
      }
    };
    const cases = [
      ['csv-text', { rows: [{ value: '1' }] }],
      ['parse-markdown', { text: '# Hello\n\nA **formatted** paragraph.' }],
      ['read-file', { payload: { base64: btoa('raw'), mime: 'application/octet-stream', name: 'raw.bin' } }],
      ['fill-markdown-template', { templateText: '# {title}\n\nHello {name}', values: { title: 'Report', name: 'Ada' } }],
      ['fill-workbook-template', { template: workbookTemplate, values: { name: 'Ada' }, name: 'filled' }],
      ['read-text-file', { payload: { base64: btoa('Hello'), mime: 'text/plain' } }],
      ['read-table-rows', { payload: { base64: btoa('sku,qty\nA-1,2\n'), mime: 'text/csv' } }],
      ['read-table-cells', { payload: { base64: btoa('sku,qty\nA-1,2\n'), mime: 'text/csv' } }],
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
      await expect(Promise.resolve(runtime.execute(id, input)), id).resolves.toBeDefined();
    }
  });

  it('reads text and tabular files through the authorized files.read capability', async () => {
    const csv = 'sku,qty\nA-1,2\n';
    const readFile = vi.fn(async ({ fileId }) => ({
      fileId,
      name: 'inventory.csv',
      mime: 'text/csv',
      base64: btoa(csv)
    }));
    const capabilities = { 'files.read': readFile };
    const file = await runtime.execute('read-file', { fileId: 'file-1' }, { capabilities });
    expect(file.payload).toMatchObject({ mime: 'text/csv', name: 'inventory.csv', base64: btoa(csv) });
    await expect(runtime.execute('read-text-file', { fileId: 'file-1' }, { capabilities }))
      .resolves.toBe(csv);
    const rows = await runtime.execute('read-table-rows', { fileId: 'file-1' }, { capabilities });
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe('A-1');
    expect(Number(rows[0].qty)).toBe(2);
    const cells = await runtime.execute('read-table-cells', { fileId: 'file-1' }, { capabilities });
    expect(cells[0]).toMatchObject({ A: 'sku', B: 'qty' });
    expect(cells[1]).toMatchObject({ A: 'A-1' });
    expect(readFile).toHaveBeenCalledTimes(4);
    const graphValue = await runtime.execute('read-table-rows', {
      mode: 'preview', inputs: { fileId: 'file-1' }
    }, { capabilities });
    expect(graphValue.value[0].sku).toBe('A-1');
  });

  it('publishes listing-derived graph providers with serializable definitions and output envelopes', async () => {
    const provider = runtime.providers.find(item => item.provider === 'plugin.documents');
    expect(provider).toBeTruthy();
    expect(() => structuredClone(runtime.providers)).not.toThrow();
    const expected = listing.declarations.services
      .filter(service => service.execution?.runtime === 'documents-shared'
        && service.execution.targets?.includes('browser')
        && service.palette?.visible !== false
        && service.palette?.group)
      .map(service => service.id)
      .sort();
    expect(provider.definitions.map(definition => definition.id).sort()).toEqual(expected);
    expect(provider.definitions.find(definition => definition.id === 'document-paragraph')?.inputs).toContainEqual(
      expect.objectContaining({
        id: 'children',
        required: false,
        shape: 'list',
        semantic: { base: 'json', kind: 'text.inline', nullable: true }
      })
    );
    expect(provider.definitions.find(definition => definition.id === 'compose-document')).toMatchObject({
      provider: 'plugin.documents',
      version: '1',
      palette: { group: 'document-composition', label: 'Document composition' },
      inputs: [{ id: 'title', semantic: { base: 'string' }, required: false }, {
        id: 'blocks', shape: 'list', semantic: { base: 'json', kind: 'text.document-block' }, required: true
      }],
      outputs: [{ id: 'value', semantic: { base: 'json', kind: 'text.flow-document' } }],
      execution: { runtime: 'documents-shared', kind: 'pure', targets: ['browser', 'server'] }
    });
    const block = await runtime.execute('document-paragraph', {
      mode: 'preview',
      inputs: { text: 'From graph' }
    });
    expect(block).toEqual({
      value: { type: 'paragraph', children: [{ type: 'text', text: 'From graph' }] }
    });
  });

  it('fills XLSX templates in the shared runtime and returns a real workbook payload', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Hello {name}']]), 'Sheet1');
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const template = {
      payload: {
        base64: Buffer.from(bytes).toString('base64'),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        name: 'template.xlsx'
      }
    };
    const result = runtime.execute('fill-workbook-template', {
      template, values: { name: 'Ada' }, name: 'filled'
    });
    expect(result.payload).toMatchObject({
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      name: 'filled.xlsx'
    });
    const binary = atob(result.payload.base64);
    const filledBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const filled = XLSX.read(filledBytes, { type: 'array' });
    expect(filled.Sheets.Sheet1.A1.v).toBe('Hello Ada');
  });

  it('fills Markdown templates and returns a real Markdown file payload', () => {
    const result = runtime.execute('fill-markdown-template', {
      templateText: '# {title}\n\nHello {name}; missing {missing}',
      values: { title: 'Report', name: 'Ada' },
      name: 'welcome-report'
    });
    expect(result.payload.mime).toBe('text/markdown');
    expect(result.payload.name).toBe('welcome-report.md');
    expect(atob(result.payload.base64)).toBe('# Report\n\nHello Ada; missing {missing}');
  });

  it('parses Markdown into typed flow-document values in the shared runtime', async () => {
    const document = await runtime.execute('parse-markdown', {
      mode: 'preview',
      inputs: { text: '# Hello\n\nA **formatted** paragraph.\n\n- One\n- Two' }
    });
    expect(document.value).toMatchObject({
      type: 'text.flow-document',
      schemaVersion: 1,
      blocks: [
        { type: 'heading', level: 1 },
        { type: 'paragraph', children: expect.arrayContaining([expect.objectContaining({ type: 'strong' })]) },
        { type: 'list', items: expect.arrayContaining([expect.any(Array)]) }
      ]
    });
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
