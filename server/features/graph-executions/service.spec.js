import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION,
  createGraphExecutionRecord
} from '#packages/core';

const mocks = vi.hoisted(() => ({
  getAppRegistry: vi.fn(),
  findFileMeta: vi.fn(),
  assertFileReadAccess: vi.fn(),
  getFileBuffer: vi.fn(),
  bakeFile: vi.fn(),
  retractBakedFile: vi.fn()
}));
vi.mock('~/server/runtime/app-registry.js', () => ({ getAppRegistry: mocks.getAppRegistry }));
vi.mock('../files/service.js', () => ({
  findFileMeta: mocks.findFileMeta,
  assertFileReadAccess: mocks.assertFileReadAccess,
  getFileBuffer: mocks.getFileBuffer
}));
vi.mock('../pages/service.js', () => ({
  bakeFile: mocks.bakeFile,
  retractBakedFile: mocks.retractBakedFile
}));

import * as graphExecutionsService from './service.js';

const graph = () => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: GRAPH_DOCUMENT_VERSION,
  id: 'graph.document',
  revision: 'rev-01',
  name: 'Document graph',
  interface: {
    inputs: [{ id: 'source', label: 'Source', contract: { shape: 'item', semantic: { base: 'entityRef' } } }],
    outputs: [{ id: 'document', label: 'Document', contract: { shape: 'item', semantic: { base: 'document' } } }]
  },
  nodes: [
    { id: 'input-1', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'source' } },
    { id: 'format-1', operation: { provider: 'plugin.documents', id: 'document.compose', version: '3' }, config: { template: 'brief' }, position: { x: 20, y: 40 } },
    { id: 'output-1', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'document' } }
  ],
  edges: [
    { id: 'edge-1', source: { node: 'input-1', port: 'value' }, target: { node: 'format-1', port: 'source' } },
    { id: 'edge-2', source: { node: 'format-1', port: 'document' }, target: { node: 'output-1', port: 'value' } }
  ]
});

const preview = () => createGraphExecutionRecord({
  id: 'preview-1',
  graph: { id: 'graph.document', revision: 'rev-01' },
  profile: 'procedural-preview',
  status: 'succeeded',
  startedAt: '2026-11-16T10:00:00.000Z',
  completedAt: '2026-11-16T10:00:01.000Z',
  inputs: { source: null },
  outputs: { document: 'Generated document' },
  nodeOutputs: {},
  diagnostics: [],
  provenance: { nodes: [], invocations: [] },
  readSet: { instances: [], relations: [], queries: [] },
  artifacts: []
});

describe('graph execution service', () => {
  const auth = { userId: 'user-1', organizationId: 'org-1' };
  const graphDocument = {
    _id: 'graph-instance-1',
    organizationId: 'org-1',
    fields: { graphId: 'graph.document' },
    payload: { fileId: 'graph-file-1' }
  };
  const executionService = { create: vi.fn() };
  const graphService = { processGetById: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    graphService.processGetById.mockResolvedValue(graphDocument);
    executionService.create.mockResolvedValue({ _id: 'execution-instance-1' });
    mocks.getAppRegistry.mockReturnValue({
      getInstanceService: typeId => typeId === 'graph-document' ? graphService : executionService
    });
    mocks.findFileMeta.mockResolvedValue({ metadata: { organizationId: 'org-1' }, contentType: 'application/json' });
    mocks.assertFileReadAccess.mockReturnValue(true);
    mocks.getFileBuffer.mockResolvedValue(Buffer.from(JSON.stringify(graph())));
    mocks.bakeFile.mockResolvedValue({
      page: { _id: 'page-1' },
      file: { path: 'exports/document.txt', fileId: 'baked-file-1', mime: 'text/plain', size: 18, revision: 1 }
    });
    mocks.retractBakedFile.mockResolvedValue({ success: true });
  });

  it('records an execution only against the exact authorized saved graph revision', async () => {
    await expect(graphExecutionsService.recordExecution({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview()
    }, auth)).resolves.toMatchObject({ _id: 'execution-instance-1' });
    expect(graphService.processGetById).toHaveBeenCalledWith('graph-instance-1', auth);
    expect(executionService.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.objectContaining({ graphId: 'graph.document', graphRevision: 'rev-01', profile: 'procedural-preview' })
    }), 'user-1', 'org-1');
  });

  it('rejects a stale execution before persistence', async () => {
    mocks.getFileBuffer.mockResolvedValue(Buffer.from(JSON.stringify({ ...graph(), revision: 'rev-02' })));
    await expect(graphExecutionsService.recordExecution({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview()
    }, auth)).rejects.toMatchObject({ statusCode: 409 });
    expect(executionService.create).not.toHaveBeenCalled();
  });

  it('bakes a selected output and records the destination as a procedural-bake execution', async () => {
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: { type: 'page-file', pageId: 'page-1', path: 'exports/document.txt', conflictPolicy: 'fail' }
    }, auth);
    expect(mocks.bakeFile).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 'page-1',
      path: 'exports/document.txt',
      buffer: Buffer.from('Generated document'),
      mimeType: 'text/plain; charset=utf-8',
      provenance: expect.objectContaining({ graphId: 'graph.document', graphRevision: 'rev-01', outputId: 'document' })
    }), auth);
    expect(executionService.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.objectContaining({
        profile: 'procedural-bake',
        artifacts: [expect.objectContaining({ kind: 'page-file', pageId: 'page-1', fileId: 'baked-file-1', outputId: 'document' })]
      })
    }), 'user-1', 'org-1');
    expect(result.file.fileId).toBe('baked-file-1');
    expect(result.execution._id).toBe('execution-instance-1');
  });

  it('retracts the page file if execution provenance persistence fails', async () => {
    executionService.create.mockRejectedValueOnce(new Error('record unavailable'));
    await expect(graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: { type: 'page-file', pageId: 'page-1', path: 'exports/document.txt' }
    }, auth)).rejects.toThrow('record unavailable');
    expect(mocks.retractBakedFile).toHaveBeenCalledWith({ pageId: 'page-1', fileId: 'baked-file-1' }, auth);
  });
});
