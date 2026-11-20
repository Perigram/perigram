import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION
} from '#packages/core';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Saved-graph preview → page-file Bake → reopen acceptance for the
// Documents managed runtimes (TESTING layer 3): the real evaluator and
// the real managed dispatch run together over a mocked task queue whose
// enqueued documents-server/documents-shared tasks execute the real
// runtime modules — the same execute(operationId, input) call the
// isolated plugin-runtime child makes. Only the task queue, storage
// seams, and the pages write are mocked.

const mocks = vi.hoisted(() => ({
  getAppRegistry: vi.fn(),
  findInstall: vi.fn(),
  enqueueTask: vi.fn(),
  getTaskRunById: vi.fn(),
  cancelTaskRun: vi.fn(),
  withOrganizationDataSnapshot: vi.fn(),
  withOrganizationChangeSequence: vi.fn(),
  runOrganizationChange: vi.fn(),
  ensureOrganizationChangeIndexes: vi.fn(),
  connectDB: vi.fn(),
  findFileMeta: vi.fn(),
  assertFileReadAccess: vi.fn(),
  getFileBuffer: vi.fn(),
  contentHash: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  bakeFile: vi.fn(),
  retractBakedFile: vi.fn()
}));

vi.mock('~/server/runtime/app-registry.js', () => ({ getAppRegistry: mocks.getAppRegistry }));
vi.mock('~/server/db/mongo', () => ({ connectDB: mocks.connectDB }));
vi.mock('../files/service.js', () => ({
  findFileMeta: mocks.findFileMeta,
  assertFileReadAccess: mocks.assertFileReadAccess,
  getFileBuffer: mocks.getFileBuffer,
  contentHash: mocks.contentHash,
  uploadFile: mocks.uploadFile,
  deleteFile: mocks.deleteFile
}));
vi.mock('../pages/service.js', () => ({
  bakeFile: mocks.bakeFile,
  retractBakedFile: mocks.retractBakedFile
}));
vi.mock('../instance-revisions/service.js', () => ({ ensureRevisionIndexes: vi.fn(async () => {}) }));
vi.mock('../instances/service.js', () => ({
  declarationForType: vi.fn(async () => ({ fields: {} })),
  invalidateInstanceDeclarations: vi.fn(),
  instanceServiceResolver: vi.fn(() => null)
}));
vi.mock('../instances/index.js', () => ({
  ensureOrganizationChangeIndexes: mocks.ensureOrganizationChangeIndexes,
  withOrganizationDataSnapshot: mocks.withOrganizationDataSnapshot,
  withOrganizationChangeSequence: mocks.withOrganizationChangeSequence,
  runOrganizationChange: mocks.runOrganizationChange
}));
vi.mock('../instance-events/service.js', () => ({ publishOrgContractChanged: vi.fn() }));
vi.mock('../process-definitions/service.js', () => ({
  findTypeReferences: vi.fn(async () => []),
  resolveRunActor: vi.fn(async auth => auth)
}));
vi.mock('../cts-types/repository.js', () => ({
  findByTypeId: vi.fn(async () => null),
  listByOrganization: vi.fn(async () => [])
}));
vi.mock('../../utils/auth-helpers.js', () => ({ hasPermission: vi.fn(() => true) }));
vi.mock('../../core/tasks/service.js', () => ({
  enqueueTask: mocks.enqueueTask,
  getTaskRunById: mocks.getTaskRunById,
  cancelTaskRun: mocks.cancelTaskRun
}));
vi.mock('../plugins/repository.js', () => ({
  findInstall: mocks.findInstall,
  listInstallsByOrganization: vi.fn(async () => [])
}));

import * as graphExecutionsService from './service.js';
import { createRuntime as createDocumentsSharedRuntime } from '../../../workers/documents/runtime/shared.mjs';
import { createRuntime as createDocumentsServerRuntime } from '../../../workers/documents/runtime/server.mjs';
import documentsListing from '../../../workers/documents/listing.json';
import * as XLSX from '../../../workers/documents/assets/vendor/xlsx.mjs';

const auth = { userId: 'user-1', organizationId: 'org-1' };

// The installed-package snapshot mirrors the pinned listing: provider
// definitions and package pins resolve exactly as a real install would.
const documentsInstall = () => ({
  pluginId: 'documents',
  version: documentsListing.version,
  services: documentsListing.declarations.services,
  declarations: { runtimes: documentsListing.declarations.runtimes }
});

const documentsRuntimes = {
  'documents-shared': createDocumentsSharedRuntime(),
  'documents-server': createDocumentsServerRuntime()
};

const FILE_CONTRACT = { shape: 'item', semantic: { base: 'json', kind: 'documents.file' } };
const STRING_CONTRACT = { shape: 'item', semantic: { base: 'string' } };

const pdfGraph = () => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: GRAPH_DOCUMENT_VERSION,
  id: 'graph.documents-pdf',
  revision: 'rev-01',
  name: 'Documents PDF export',
  interface: {
    inputs: [{ id: 'title', label: 'Title', contract: STRING_CONTRACT }],
    outputs: [{ id: 'file', label: 'PDF file', contract: FILE_CONTRACT }]
  },
  nodes: [
    { id: 'input-title', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'title' } },
    { id: 'heading-1', operation: { provider: 'plugin.documents', id: 'document-heading', version: '1' }, config: {} },
    { id: 'compose-1', operation: { provider: 'plugin.documents', id: 'compose-document', version: '1' }, config: {} },
    { id: 'export-pdf', operation: { provider: 'plugin.documents', id: 'render-document-pdf', version: '1' }, config: {} },
    { id: 'output-file', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'file' } }
  ],
  edges: [
    { id: 'edge-title', source: { node: 'input-title', port: 'value' }, target: { node: 'heading-1', port: 'text' } },
    { id: 'edge-block', source: { node: 'heading-1', port: 'value' }, target: { node: 'compose-1', port: 'blocks' } },
    { id: 'edge-document', source: { node: 'compose-1', port: 'value' }, target: { node: 'export-pdf', port: 'document' } },
    { id: 'edge-file', source: { node: 'export-pdf', port: 'value' }, target: { node: 'output-file', port: 'value' } }
  ]
});

const markdownFillGraph = () => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: GRAPH_DOCUMENT_VERSION,
  id: 'graph.documents-markdown-fill',
  revision: 'rev-01',
  name: 'Documents Markdown template fill',
  interface: {
    inputs: [{ id: 'template', label: 'Template text', contract: STRING_CONTRACT }],
    outputs: [{ id: 'document', label: 'Filled document', contract: FILE_CONTRACT }]
  },
  nodes: [
    { id: 'input-template', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'template' } },
    { id: 'fill-md', operation: { provider: 'plugin.documents', id: 'fill-markdown-template', version: '1' }, config: { values: { client: 'ООО Ромашка', total: 3 } } },
    { id: 'output-document', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'document' } }
  ],
  edges: [
    { id: 'edge-template', source: { node: 'input-template', port: 'value' }, target: { node: 'fill-md', port: 'templateText' } },
    { id: 'edge-document', source: { node: 'fill-md', port: 'value' }, target: { node: 'output-document', port: 'value' } }
  ]
});

const workbookFillGraph = () => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: GRAPH_DOCUMENT_VERSION,
  id: 'graph.documents-workbook-fill',
  revision: 'rev-01',
  name: 'Documents XLSX template fill',
  interface: {
    inputs: [{ id: 'template', label: 'Workbook template', contract: FILE_CONTRACT }],
    outputs: [{ id: 'workbook', label: 'Filled workbook', contract: FILE_CONTRACT }]
  },
  nodes: [
    { id: 'input-template', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'template' } },
    { id: 'fill-xlsx', operation: { provider: 'plugin.documents', id: 'fill-workbook-template', version: '1' }, config: { values: { client: 'Ada', items: [{ name: 'Widget' }, { name: 'Gear' }] } } },
    { id: 'output-workbook', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'workbook' } }
  ],
  edges: [
    { id: 'edge-template', source: { node: 'input-template', port: 'value' }, target: { node: 'fill-xlsx', port: 'template' } },
    { id: 'edge-workbook', source: { node: 'fill-xlsx', port: 'value' }, target: { node: 'output-workbook', port: 'value' } }
  ]
});

async function pdfPageText(buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  page.cleanup();
  await pdf.destroy();
  return content.items.map(item => item.str).join(' ');
}

describe('Documents managed graph preview → Bake → reopen', () => {
  const graphService = { processGetById: vi.fn(), processList: vi.fn() };
  const executionService = { create: vi.fn(async () => ({ _id: 'execution-instance-1' })) };
  const graphDocument = {
    _id: 'graph-instance-1',
    organizationId: 'org-1',
    fields: { graphId: 'graph.documents-pdf' },
    payload: { fileId: 'graph-file-1' }
  };
  const taskRuns = new Map();
  let bakedWrite = null;

  const serveGraph = graph => {
    graphService.processGetById.mockImplementation(async () => ({
      ...graphDocument,
      fields: { graphId: graph.id }
    }));
    mocks.getFileBuffer.mockImplementation(async fileId => (
      fileId === 'graph-file-1' ? Buffer.from(JSON.stringify(graph))
        : fileId === 'baked-file-1' && bakedWrite ? bakedWrite.buffer
          : Buffer.from('')
    ));
  };

  const preview = (graph, inputBindings) => {
    serveGraph(graph);
    return graphExecutionsService.evaluateAndRecordSavedGraphPreview({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings
    }, auth);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    taskRuns.clear();
    bakedWrite = null;
    mocks.findInstall.mockResolvedValue(documentsInstall());
    mocks.getTaskRunById.mockImplementation(async id => taskRuns.get(String(id)) || null);
    mocks.enqueueTask.mockImplementation(async (taskId, input, runAuth, options) => {
      const pin = input?.parameters?.value || {};
      const runtime = documentsRuntimes[pin.runtimeId];
      if (!runtime) throw new Error(`No real Documents runtime mounted for ${pin.runtimeId}`);
      // The isolated plugin-runtime child calls
      // execute(operationId, input, { capabilities, signal }); the pure
      // template/PDF operations here carry no capability calls.
      const output = await runtime.execute(pin.operationId, pin.input, {
        capabilities: { call: async name => { throw new Error(`unexpected capability call: ${name}`); } },
        signal: new AbortController().signal
      });
      const run = {
        _id: `run-${taskId}`,
        taskId,
        input,
        status: 'SUCCEEDED',
        claimToken: 'claim-1',
        workerType: options?.workerType,
        output: { ok: true, data: { output, capabilityEvidence: [] } }
      };
      taskRuns.set(String(run._id), run);
      return run;
    });
    mocks.cancelTaskRun.mockResolvedValue(null);
    mocks.getAppRegistry.mockReturnValue({
      getInstanceService: typeId => (typeId === 'graph-document' ? graphService
        : typeId === 'graph-execution' ? executionService : null)
    });
    graphService.processList.mockResolvedValue([]);
    mocks.withOrganizationDataSnapshot.mockImplementation(async (_organizationId, read) => ({
      value: await read(),
      boundary: { consistency: 'snapshot', snapshotId: 'snap-7', organizationSequenceStart: 7, organizationSequenceEnd: 7 }
    }));
    mocks.withOrganizationChangeSequence.mockImplementation(async (_organizationId, read) => ({
      value: await read(),
      boundary: { consistency: 'sequence-bracketed', snapshotId: null, organizationSequenceStart: 7, organizationSequenceEnd: 7 }
    }));
    mocks.runOrganizationChange.mockImplementation(async (_organizationId, _metadata, mutate) => await mutate());
    mocks.connectDB.mockResolvedValue({
      client: { startSession: () => ({ withTransaction: async callback => await callback(), endSession: async () => {} }) },
      collection: () => ({})
    });
    mocks.findFileMeta.mockResolvedValue({ metadata: { organizationId: 'org-1' }, contentType: 'application/json' });
    mocks.assertFileReadAccess.mockReturnValue(true);
    mocks.contentHash.mockImplementation(buffer => `sha256:${buffer.length}`);
    mocks.bakeFile.mockImplementation(async write => {
      bakedWrite = write;
      return {
        page: { _id: write.pageId, revision: 2 },
        file: { path: write.path, fileId: 'baked-file-1', mime: write.mimeType, size: write.buffer.length, revision: 1 }
      };
    });
  });

  it('previews a compose → render-document-pdf graph, Bakes the exact bytes, and reopens a readable PDF with persisted provenance', async () => {
    const { execution } = await preview(pdfGraph(), { title: 'Отчёт по раскрою' });

    expect(execution).toMatchObject({ profile: 'procedural-preview', status: 'succeeded' });
    const pdfOutput = execution.outputs.file;
    expect(pdfOutput.payload).toMatchObject({ mime: 'application/pdf', base64: expect.any(String) });
    const previewBytes = Buffer.from(pdfOutput.payload.base64, 'base64');
    expect(previewBytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(await pdfPageText(previewBytes)).toContain('Отчёт по раскрою');

    const version = documentsListing.version;
    expect(execution.provenance.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ pluginId: 'documents', version, runtimeId: 'documents-shared', operations: ['compose-document', 'document-heading'] }),
      expect.objectContaining({ pluginId: 'documents', version, runtimeId: 'documents-server', operations: ['render-document-pdf'] })
    ]));
    expect(execution.provenance.nodes).toHaveLength(3);
    for (const node of execution.provenance.nodes) {
      expect(node).toMatchObject({ status: 'succeeded', taskRunId: expect.any(String), packagePin: expect.objectContaining({ pluginId: 'documents', version }) });
    }
    expect(execution.readSet.unverifiedCapabilities).toEqual([]);
    expect(executionService.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.objectContaining({ profile: 'procedural-preview', status: 'succeeded', graphId: 'graph.documents-pdf', graphRevision: 'rev-01' })
    }), 'user-1', 'org-1');

    const bake = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: execution,
      outputId: 'file',
      destination: { type: 'page-file', pageId: 'page-1', path: 'exports/report.pdf' }
    }, auth);

    expect(Buffer.isBuffer(bakedWrite.buffer)).toBe(true);
    expect(bakedWrite.buffer.equals(previewBytes)).toBe(true);
    expect(bakedWrite.mimeType).toBe('application/pdf');
    expect(bakedWrite.provenance).toMatchObject({ graphId: 'graph.documents-pdf', graphRevision: 'rev-01', outputId: 'file', executionId: bake.execution.id });
    expect(bake.execution).toMatchObject({ profile: 'procedural-bake', status: 'succeeded' });
    expect(bake.execution.artifacts).toEqual([expect.objectContaining({
      kind: 'page-file', pageId: 'page-1', fileId: 'baked-file-1', outputId: 'file', mime: 'application/pdf', size: bakedWrite.buffer.length
    })]);
    expect(executionService.create).toHaveBeenLastCalledWith(expect.objectContaining({
      fields: expect.objectContaining({
        profile: 'procedural-bake',
        provenance: expect.objectContaining({ providers: execution.provenance.providers }),
        readSet: execution.readSet,
        artifacts: bake.execution.artifacts
      })
    }), 'user-1', 'org-1');

    const reopened = await mocks.getFileBuffer('baked-file-1', 'pages');
    expect(reopened.equals(previewBytes)).toBe(true);
    expect(await pdfPageText(reopened)).toContain('Отчёт по раскрою');
  });

  it('previews a Markdown template fill graph with authored values, keeps missing tokens, and Bakes the filled file', async () => {
    const { execution } = await preview(markdownFillGraph(), { template: '# Заказ {order}\n\nКлиент: {client}\nИтого: {total} руб.' });

    expect(execution).toMatchObject({ profile: 'procedural-preview', status: 'succeeded' });
    const filled = execution.outputs.document;
    expect(filled.payload.mime).toBe('text/markdown');
    const filledText = Buffer.from(filled.payload.base64, 'base64').toString('utf8');
    expect(filledText).toBe('# Заказ {order}\n\nКлиент: ООО Ромашка\nИтого: 3 руб.');
    expect(filled.meta).toEqual({ tokens: ['order', 'client', 'total'] });
    expect(execution.provenance.providers).toEqual([
      expect.objectContaining({ pluginId: 'documents', version: documentsListing.version, runtimeId: 'documents-shared', operations: ['fill-markdown-template'] })
    ]);
    expect(execution.readSet.unverifiedCapabilities).toEqual([]);

    const bake = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: execution,
      outputId: 'document',
      destination: { type: 'page-file', pageId: 'page-1', path: 'exports/order.md' }
    }, auth);

    expect(bakedWrite.mimeType).toBe('text/markdown');
    expect(bakedWrite.buffer.toString('utf8')).toBe(filledText);
    expect(bake.execution.artifacts).toEqual([expect.objectContaining({ kind: 'page-file', outputId: 'document', mime: 'text/markdown' })]);
    const reopened = await mocks.getFileBuffer('baked-file-1', 'pages');
    expect(reopened.toString('utf8')).toBe(filledText);
  });

  it('previews an XLSX template fill graph with a repeated section and Bakes the expanded workbook', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Client', '{client}'],
      ['Line', '{#items}'],
      ['Item', '{name}'],
      ['{/items}', '']
    ]), 'Report');
    const templateBytes = Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
    const templateBinding = {
      payload: {
        base64: templateBytes.toString('base64'),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        name: 'template.xlsx'
      }
    };

    const { execution } = await preview(workbookFillGraph(), { template: templateBinding });

    expect(execution).toMatchObject({ profile: 'procedural-preview', status: 'succeeded' });
    const filled = execution.outputs.workbook;
    expect(filled.payload).toMatchObject({
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      name: 'template.xlsx'
    });
    expect(filled.meta).toEqual({ tokens: ['client', 'name'], sections: ['items'] });
    const filledBytes = Buffer.from(filled.payload.base64, 'base64');
    const sheet = XLSX.read(filledBytes, { type: 'buffer' }).Sheets.Report;
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })).toEqual([
      ['Client', 'Ada'],
      ['Item', 'Widget'],
      ['Item', 'Gear']
    ]);
    expect(execution.readSet.unverifiedCapabilities).toEqual([]);

    const bake = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: execution,
      outputId: 'workbook',
      destination: { type: 'page-file', pageId: 'page-1', path: 'exports/filled-report.xlsx' }
    }, auth);

    expect(bakedWrite.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(bakedWrite.buffer.equals(filledBytes)).toBe(true);
    expect(bake.execution.artifacts).toEqual([expect.objectContaining({ kind: 'page-file', outputId: 'workbook' })]);
    expect((await mocks.getFileBuffer('baked-file-1', 'pages')).equals(filledBytes)).toBe(true);
  });
});
