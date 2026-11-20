// Documents plugin contract: the listing's declared surface against the
// runtimes that implement it — discovery through the canonical SDK parser,
// declaration inventory honesty, palette honesty through the wireable gate,
// socket projection, the representative typed-block → compose → export →
// fill → PDF workflow chain through the real runtime modules, and refusal
// guidance. Engine laws (fill.spec.js) and the saved-graph preview → Bake →
// reopen legs (documents-preview-bake.spec.js) carry their own coverage.
import { describe, expect, it } from 'vitest';
import { parseListing } from '@perigram/plugin-sdk/listing';
import { pluginPaletteGroups, resolveCatalogNodePorts } from '#packages/processes';
import listing from './listing.json';
import * as XLSX from './assets/vendor/xlsx.mjs';
import { createRuntime as createSharedRuntime } from './runtime/shared.mjs';
import { createRuntime as createServerRuntime } from './runtime/server.mjs';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// The platform composes only wireable services into the palette
// (servicesForOrganization's record-input gate).
const wireable = service => {
  const input = service.signature?.input;
  return !input || input.base === 'record';
};

const paletteVisible = service => service.palette?.group && service.palette?.visible !== false;

describe('Documents listing contract', () => {
  it('validates through the canonical SDK parser the install gate runs', () => {
    expect(() => parseListing(listing, 'workers/documents')).not.toThrow();
  });

  it('declares the office/media file family with content revisions on every payload-bearing type', () => {
    const types = Object.fromEntries(listing.declarations.types.map(type => [type.id, type]));
    expect([...listing.declarations.types.map(type => type.id)].sort()).toEqual([
      'csv-table', 'docx-document', 'html-document', 'image', 'pdf-document', 'text-document', 'xlsx-workbook'
    ]);
    for (const type of listing.declarations.types) {
      expect(type.class, type.id).toBe('file');
      expect(type.revisions, type.id).toBe('content');
      expect(type.fields.name, type.id).toMatchObject({ base: 'string', identifier: true });
    }
    // The render construct's source vocabulary reaches outside the plugin:
    // dxf-source is a tech-drawing type, so the plugin requires it.
    expect(listing.requires).toEqual(['tech-drawing']);
    expect(types['pdf-document'].operators.render.input.fields.source.accepts).toContain('dxf-source');
    // The two template-bearing fill types and the PDF render construct.
    expect(Object.keys(listing.declarations.constructions)).toEqual(['text-document', 'xlsx-workbook', 'pdf-document']);
    expect(listing.declarations.constructions['pdf-document']).toEqual({
      fill: 'plugin.documents.fill',
      render: 'plugin.documents.render-pdf'
    });
  });

  it('binds every projection, construction, editor, preview, and channel to declared ids of its own', () => {
    const serviceIds = new Set(listing.declarations.services.map(service => service.id));
    const own = id => serviceIds.has(String(id).replace('plugin.documents.', ''));
    const fileTypeIds = new Set(listing.declarations.types.map(type => type.id));
    const surfaceIds = new Set(listing.declarations.surfaces.map(surface => surface.id));
    const previewSurfaceIds = new Set(listing.declarations.surfaces
      .filter(surface => surface.kind === 'preview').map(surface => surface.id));

    for (const type of listing.declarations.types) {
      for (const projection of type.projections || []) {
        expect(own(projection.resolve?.service), `${type.id}/${projection.id}`).toBe(true);
      }
    }
    for (const [typeId, modes] of Object.entries(listing.declarations.constructions)) {
      expect(fileTypeIds.has(typeId), typeId).toBe(true);
      for (const serviceId of Object.values(modes)) expect(own(serviceId), `${typeId} construction`).toBe(true);
    }
    for (const editor of listing.declarations.editors) {
      expect(fileTypeIds.has(editor.type), editor.type).toBe(true);
      expect(surfaceIds.has(editor.surface), editor.surface).toBe(true);
    }
    for (const preview of listing.declarations.previews) {
      expect(fileTypeIds.has(preview.type), preview.type).toBe(true);
      expect(previewSurfaceIds.has(preview.surface), preview.surface).toBe(true);
    }
    for (const channel of listing.declarations.previewChannels) {
      expect(previewSurfaceIds.has(channel.surface), channel.id).toBe(true);
    }
    for (const starter of listing.declarations.starterConstructs) {
      expect(fileTypeIds.has(starter.typeId), starter.typeId).toBe(true);
      expect(listing.declarations.types.find(type => type.id === starter.typeId).payload.creation)
        .toContain(starter.construction);
    }
  });

  it('declares the managed runtime split the runtimes implement', () => {
    expect(listing.declarations.runtimes).toEqual([
      { id: 'documents-shared', language: 'javascript', version: '1', entry: '/runtime/shared-bundle.mjs', targets: ['browser', 'server'] },
      { id: 'documents-server', language: 'javascript', version: '1', entry: '/runtime/server.mjs', targets: ['server'] }
    ]);
    const services = listing.declarations.services;
    expect(services).toHaveLength(34);
    // Every service declares managed execution; no endpoint mode remains.
    for (const service of services) {
      expect(service.mode, service.id).toBeUndefined();
      expect(service.execution?.runtime, service.id).toMatch(/documents-(shared|server)/);
    }
    // The shared runtime publishes exactly its browser-visible operations;
    // the server runtime owns the four construction/PDF operations.
    const sharedRuntime = createSharedRuntime();
    const provider = sharedRuntime.providers.find(item => item.provider === 'plugin.documents');
    const expectedShared = services
      .filter(service => service.execution.runtime === 'documents-shared'
        && service.execution.targets.includes('browser') && paletteVisible(service))
      .map(service => service.id).sort();
    expect(expectedShared).toHaveLength(27);
    expect(provider.definitions.map(definition => definition.id).sort()).toEqual(expectedShared);
    expect(services.filter(service => service.execution.runtime === 'documents-server').map(service => service.id).sort())
      .toEqual(['fill', 'render-document-pdf', 'render-pdf', 'render-report-pdf']);
  });
});

describe('Documents palette honesty', () => {
  it('keeps every palette-visible service wireable and hides exactly the projection and construction helpers', () => {
    const services = listing.declarations.services;
    const hidden = services.filter(service => service.palette?.visible === false).map(service => service.id).sort();
    expect(hidden).toEqual(['fill', 'render-pdf', 'table-cells', 'table-rows', 'text']);
    for (const service of services.filter(paletteVisible)) {
      expect(wireable(service), service.id).toBe(true);
    }
  });

  it('composes the declared groups through the wireable gate the designer rides', () => {
    const projections = Object.fromEntries(
      listing.declarations.types.flatMap(type => (type.projections || []).map(projection => [
        `${type.id}:${projection.id}`,
        { ...projection, typeId: type.id, pluginId: listing.pluginId }
      ]))
    );
    const services = Object.fromEntries(
      listing.declarations.services
        .filter(wireable)
        .map(service => [service.id, { ...service, command: `plugin.documents.${service.id}`, pluginId: listing.pluginId }])
    );
    const groups = pluginPaletteGroups(projections, services);
    expect(groups).toHaveLength(1);
    const section = groups[0];
    expect(section).toMatchObject({ id: 'plugin-documents', source: 'plugin' });
    expect(section.subgroups.map(group => group.id).sort()).toEqual([
      'document-blocks', 'document-composition', 'document-export', 'document-sources', 'document-templates', 'inline-content', 'table-data'
    ]);
    const items = section.subgroups.flatMap(group => group.items);
    // The palette dedupes projection ids across types: text, rows, cells.
    const visibleServices = listing.declarations.services.filter(service => wireable(service) && paletteVisible(service));
    const projectionIds = new Set(listing.declarations.types
      .flatMap(type => (type.projections || [])
        .filter(projection => projection.palette?.group && projection.palette.visible !== false)
        .map(projection => projection.id)));
    expect(items).toHaveLength(visibleServices.length + projectionIds.size);
    expect(projectionIds.size).toBe(3);
    expect(items.map(item => item.id)).not.toEqual(expect.arrayContaining([
      'service:documents:table-rows', 'service:documents:table-cells', 'service:documents:text',
      'service:documents:fill', 'service:documents:render-pdf'
    ]));
    for (const item of items.filter(entry => entry.kind === 'cts.read')) {
      expect(projectionIds.has(item.id.replace('extract:documents:', '')), item.id).toBe(true);
    }
  });
});

describe('Documents socket projection', () => {
  const sharedRuntime = createSharedRuntime();
  const provider = sharedRuntime.providers.find(item => item.provider === 'plugin.documents');
  const definitionOf = id => provider.definitions.find(definition => definition.id === id);

  it('carries nested typed-socket semantics from the listing schemas', () => {
    expect(definitionOf('read-file').inputs).toEqual([
      expect.objectContaining({
        id: 'fileId', required: true, shape: 'item',
        semantic: { base: 'string', kind: 'documents.file-id' }
      }),
      expect.objectContaining({ id: 'typeId', required: false, shape: 'item', semantic: { base: 'string', nullable: true } })
    ]);
    expect(definitionOf('fill-workbook-template').inputs).toContainEqual(
      expect.objectContaining({
        id: 'template', required: true, shape: 'item',
        semantic: { base: 'json', kind: 'documents.file' }
      })
    );
    expect(definitionOf('fill-workbook-template').configuration.properties.values).toMatchObject({
      semantic: { kind: 'documents.template-values' }
    });
    expect(definitionOf('compose-document').outputs).toEqual([
      expect.objectContaining({ id: 'value', required: true, semantic: { base: 'json', kind: 'text.flow-document' } })
    ]);
  });

  it('declares defaults and optionality the runtime honors', () => {
    const heading = definitionOf('document-heading');
    expect(heading.inputs.find(port => port.id === 'level')).toMatchObject({ default: 1 });
    const list = definitionOf('document-list');
    expect(list.inputs.find(port => port.id === 'ordered')).toMatchObject({ default: false });
    expect(list.inputs.find(port => port.id === 'items')).toMatchObject({ required: false });
    expect(list.inputs.find(port => port.id === 'inlineItems')).toMatchObject({
      required: false, shape: 'list', semantic: { base: 'json', kind: 'text.inline', nullable: true }
    });
    // A report composes from a flow document alone; the export nodes keep
    // their name input optional beside the required typed input.
    const report = definitionOf('compose-report');
    for (const port of report.inputs) expect(port.required, port.id).toBe(false);
    const reportPdf = listing.declarations.services.find(service => service.id === 'render-report-pdf');
    expect(reportPdf.signature.input.fields.name).toMatchObject({ base: 'string', nullable: true });
    expect(reportPdf.signature.input.fields.report).toMatchObject({ kind: 'document.report' });
    expect(definitionOf('export-markdown-file').inputs.find(port => port.id === 'name').required).toBe(false);
  });

  it('projects the HAG service surface with data sockets and keeps bare-value executors socketless', () => {
    const table = listing.declarations.services.find(service => service.id === 'document-table');
    const ports = resolveCatalogNodePorts({ kind: 'cts.service', operator: 'plugin.documents.document-table' }, {
      domain: { serviceContracts: { 'plugin.documents.document-table': { ...table, command: 'plugin.documents.document-table' } } }
    });
    expect(ports.inputs.filter(socket => socket.role !== 'control')).toEqual([
      expect.objectContaining({ id: 'rows', required: true })
    ]);
    expect(ports.outputs.filter(socket => socket.role !== 'control')).toHaveLength(1);
    for (const service of listing.declarations.services.filter(item => !wireable(item))) {
      const bare = resolveCatalogNodePorts({ kind: 'cts.service', operator: `plugin.documents.${service.id}` }, {
        domain: { serviceContracts: {} }
      });
      expect(bare.inputs.filter(socket => socket.role !== 'control'), service.id).toEqual([]);
    }
  });
});

describe('Documents workflow chain', () => {
  const sharedRuntime = createSharedRuntime();
  const serverRuntime = createServerRuntime();
  const graphCall = async (runtime, operationId, inputs, config = {}) => runtime.execute(operationId, {
    mode: 'preview', inputs, config
  });

  it('composes typed blocks into a document, exports it, refills it as a template, and renders it to PDF', async () => {
    const text = sharedRuntime.execute('inline-text', { text: 'Widget' });
    const strong = sharedRuntime.execute('inline-mark', { mark: 'strong', children: [text] });
    const heading = sharedRuntime.execute('document-heading', { level: 1, children: [strong] });
    const paragraph = sharedRuntime.execute('document-paragraph', { text: 'Ready' });
    const table = sharedRuntime.execute('document-table', { rows: [{ sku: 'A-1', qty: '2' }] });
    const document = sharedRuntime.execute('compose-document', { blocks: [heading, paragraph, table] });
    expect(document).toMatchObject({ type: 'text.flow-document', schemaVersion: 1 });

    const exported = sharedRuntime.execute('export-markdown-file', { document });
    expect(exported.payload).toMatchObject({ mime: 'text/markdown' });
    const templateText = Buffer.from(exported.payload.base64, 'base64').toString('utf8');

    const filled = await graphCall(sharedRuntime, 'fill-markdown-template',
      { templateText: templateText.replace('Widget', '{part}') },
      { values: { part: 'Кассета' } });
    expect(filled.value.payload.mime).toBe('text/markdown');
    expect(Buffer.from(filled.value.payload.base64, 'base64').toString('utf8')).toContain('Кассета');
    expect(filled.value.meta).toEqual({ tokens: ['part'] });

    const report = await graphCall(sharedRuntime, 'compose-report', { flow: document });
    expect(report.value).toMatchObject({ type: 'document.report', sections: [{ blocks: [{ type: 'flow', document }] }] });

    const pdf = await graphCall(serverRuntime, 'render-report-pdf', { report: report.value });
    expect(pdf.value.payload.mime).toBe('application/pdf');
    expect(Buffer.from(pdf.value.payload.base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    // The export names its output from the report's own title when the
    // optional name input stays unwired.
    expect(pdf.value.payload.name).toBe('report.pdf');
  });

  it('answers named refusals for malformed typed inputs and wrong-kind templates', async () => {
    expect(() => sharedRuntime.execute('inline-link', { href: 'javascript:alert(1)', children: [] }))
      .toThrow(/safe/);
    expect(() => sharedRuntime.execute('document-heading', { level: 7, text: 'Bad' })).toThrow(/level/);
    expect(() => sharedRuntime.execute('compose-report', {})).toThrow(/flow document or row records/);
    expect(() => sharedRuntime.execute('fill-workbook-template', {
      template: { payload: { base64: btoa('not-a-workbook'), mime: 'text/plain', name: 't.txt' } }
    })).toThrow(/XLSX workbook templates only/);
    await expect(serverRuntime.execute('fill', {
      refs: { template: { payloadBase64: btoa('x'), payloadMime: 'text/plain', name: 't.txt' } },
      draft: { data: {} }
    })).rejects.toThrow(/fill accepts markdown, xlsx, or pdf templates/);
  });

  it('fills an XLSX construction through the documents-server runtime with section metadata', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Client', '{client}'],
      ['{#items}'],
      ['{name}'],
      ['{/items}']
    ]), 'S');
    const template = Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
    const filled = await serverRuntime.execute('fill', {
      refs: {
        template: {
          name: 'order.xlsx',
          payloadMime: XLSX_MIME,
          payloadBase64: template.toString('base64')
        }
      },
      draft: { data: { name: 'Заказ 7', values: { client: 'Ada', items: [{ name: 'Widget' }, { name: 'Gear' }] } } }
    });
    expect(filled.payload).toMatchObject({ mime: XLSX_MIME, name: 'Заказ 7.xlsx' });
    expect(filled.meta).toEqual({ tokens: ['client', 'name'], sections: ['items'] });
    const rows = XLSX.utils.sheet_to_json(
      XLSX.read(Buffer.from(filled.payload.base64, 'base64'), { type: 'buffer' }).Sheets.S,
      { header: 1, defval: '' }
    ).map(row => row.filter(cell => String(cell).trim() !== ''));
    expect(rows).toEqual([['Client', 'Ada'], ['Widget'], ['Gear']]);
  });
});
