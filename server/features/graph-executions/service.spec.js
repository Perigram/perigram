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
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  bakeFile: vi.fn(),
  retractBakedFile: vi.fn(),
  withOrganizationDataSnapshot: vi.fn(),
  ensureOrganizationChangeIndexes: vi.fn(),
  withOrganizationChangeSequence: vi.fn(),
  connectDB: vi.fn(),
  declarationForType: vi.fn(),
  runOrganizationChange: vi.fn()
}));
vi.mock('~/server/runtime/app-registry.js', () => ({ getAppRegistry: mocks.getAppRegistry }));
vi.mock('~/server/db/mongo', () => ({ connectDB: mocks.connectDB }));
vi.mock('../files/service.js', () => ({
  findFileMeta: mocks.findFileMeta,
  assertFileReadAccess: mocks.assertFileReadAccess,
  getFileBuffer: mocks.getFileBuffer,
  uploadFile: mocks.uploadFile,
  deleteFile: mocks.deleteFile
}));
vi.mock('../instance-revisions/service.js', () => ({ ensureRevisionIndexes: vi.fn(async () => {}) }));
vi.mock('../pages/service.js', () => ({
  bakeFile: mocks.bakeFile,
  retractBakedFile: mocks.retractBakedFile
}));
vi.mock('../instances/service.js', () => ({ declarationForType: mocks.declarationForType }));
vi.mock('../instances/index.js', () => ({
  ensureOrganizationChangeIndexes: mocks.ensureOrganizationChangeIndexes,
  withOrganizationDataSnapshot: mocks.withOrganizationDataSnapshot,
  withOrganizationChangeSequence: mocks.withOrganizationChangeSequence,
  runOrganizationChange: mocks.runOrganizationChange
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

const patchProposalPreview = (overrides = {}) => createGraphExecutionRecord({
  ...preview(),
  outputs: {
    document: {
      kind: 'cts.instance.patch',
      typeId: 'part',
      instanceId: 'item-1',
      expectedRevision: '3',
      conflictPolicy: 'fail',
      patch: { fields: { code: 'B' } }
    }
  },
  readSet: {
    consistency: 'unverified',
    snapshotId: null,
    organizationSequenceStart: null,
    organizationSequenceEnd: null,
    instances: [{
      typeId: 'part',
      instanceId: 'item-1',
      revision: '3',
      updatedAt: '2026-11-16T10:00:00Z',
      typeVersion: 2,
      organizationId: 'org-1'
    }],
    relations: [],
    queries: []
  },
  ...overrides
});

describe('graph execution service', () => {
  const auth = { userId: 'user-1', organizationId: 'org-1' };
  const graphDocument = {
    _id: 'graph-instance-1',
    organizationId: 'org-1',
    fields: { graphId: 'graph.document' },
    payload: { fileId: 'graph-file-1' }
  };
  const executionService = { create: vi.fn(), processList: vi.fn(), processGetById: vi.fn() };
  const graphService = { processGetById: vi.fn() };
  const dataService = { processList: vi.fn(), processGetById: vi.fn(), patch: vi.fn() };
  const payloadService = { replacePayload: vi.fn(), createForHttp: vi.fn(), patch: vi.fn(), linkRelationForHttp: vi.fn() };
  const partService = {
    processList: (...args) => dataService.processList(...args),
    processGetById: (...args) => typeof payloadService.processGetById === 'function'
      ? payloadService.processGetById(...args)
      : dataService.processGetById(...args),
    patch: (...args) => Object.hasOwn(args[1]?.fields || {}, 'attachment')
      ? payloadService.patch(...args)
      : dataService.patch(...args),
    replacePayload: (...args) => payloadService.replacePayload(...args),
    createForHttp: (...args) => payloadService.createForHttp(...args),
    linkRelationForHttp: (...args) => payloadService.linkRelationForHttp(...args)
  };
  const fileService = { createForHttp: vi.fn() };
  const session = {
    withTransaction: vi.fn(async callback => await callback()),
    endSession: vi.fn(async () => {})
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete payloadService.processGetById;
    session.withTransaction.mockImplementation(async callback => await callback());
    mocks.connectDB.mockResolvedValue({ client: { startSession: () => session } });
    graphService.processGetById.mockResolvedValue(graphDocument);
    executionService.create.mockResolvedValue({ _id: 'execution-instance-1' });
    executionService.processList.mockResolvedValue([]);
    executionService.processGetById.mockResolvedValue(null);
    mocks.getAppRegistry.mockReturnValue({
      getInstanceService: typeId => typeId === 'graph-document' ? graphService : typeId === 'graph-execution' ? executionService : ['part', 'text-document', 'html-document', 'pdf-document'].includes(typeId) ? partService : typeId === 'file-record' ? fileService : dataService
    });
    dataService.processList.mockResolvedValue([{ _id: 'item-1', type: 'part', typeVersion: 2, organizationId: 'org-1', revision: 3, updatedAt: '2026-11-16T10:00:00Z', fields: { code: 'A' } }]);
    dataService.processGetById.mockImplementation(async id => ({ _id: id, type: 'part', typeVersion: 2, organizationId: 'org-1', revision: 3, updatedAt: '2026-11-16T10:00:00Z', fields: { code: 'A' } }));
    dataService.patch.mockResolvedValue({ _id: 'item-1', type: 'part', typeVersion: 2, organizationId: 'org-1', revision: 4, updatedAt: '2026-11-16T10:01:00Z', fields: { code: 'B' } });
    dataService.patch.mockResolvedValue({ _id: 'item-1', type: 'part', revision: 4, fields: { status: 'approved' } });
    mocks.runOrganizationChange.mockImplementation(async (_organizationId, _metadata, mutate) => await mutate());
    mocks.withOrganizationChangeSequence.mockImplementation(async (_organizationId, read) => ({
      value: await read(),
      boundary: { consistency: 'sequence-bracketed', snapshotId: null, organizationSequenceStart: 4, organizationSequenceEnd: 4 }
    }));
    mocks.withOrganizationDataSnapshot.mockImplementation(async (_organizationId, read) => ({
      value: await read(),
      boundary: { consistency: 'snapshot', snapshotId: 'snapshot-42', organizationSequenceStart: 4, organizationSequenceEnd: 4 }
    }));
    mocks.findFileMeta.mockResolvedValue({ metadata: { organizationId: 'org-1' }, contentType: 'application/json' });
    mocks.assertFileReadAccess.mockReturnValue(true);
    mocks.getFileBuffer.mockResolvedValue(Buffer.from(JSON.stringify(graph())));
    mocks.uploadFile.mockResolvedValue({ id: 'baked-payload-1', filename: 'Document graph-document.txt' });
    mocks.deleteFile.mockResolvedValue(true);
    payloadService.replacePayload.mockResolvedValue({ _id: 'item-1', type: 'part', revision: 4, payload: { fileId: 'baked-payload-1', mime: 'text/plain; charset=utf-8' } });
    payloadService.createForHttp.mockResolvedValue({ _id: 'new-part-1', type: 'part', revision: 1, payload: { fileId: 'baked-payload-1', mime: 'text/plain; charset=utf-8' } });
    payloadService.patch.mockResolvedValue({ _id: 'item-1', type: 'part', revision: 4, fields: { attachment: { fileId: 'baked-payload-1', mime: 'text/plain; charset=utf-8', size: 18 } } });
    payloadService.linkRelationForHttp.mockResolvedValue({ _id: 'item-1', type: 'part', revision: 4, relations: { attachments: [{ type: 'file-record', id: 'file-record-1' }] } });
    fileService.createForHttp.mockResolvedValue({ _id: 'file-record-1', type: 'file-record', revision: 1, payload: { fileId: 'baked-payload-1', mime: 'text/plain; charset=utf-8' } });
    mocks.declarationForType.mockResolvedValue({ fields: { attachment: { base: 'blob' } } });
    mocks.bakeFile.mockResolvedValue({
      page: { _id: 'page-1' },
      file: { path: 'exports/document.txt', fileId: 'baked-file-1', mime: 'text/plain', size: 18, revision: 1 }
    });
    mocks.retractBakedFile.mockResolvedValue({ success: true });
  });

  it('lists only authorized pinned graph collection outputs from saved graph revisions', async () => {
    const collectionGraph = graph();
    collectionGraph.interface.outputs[0].contract.shape = 'list';
    mocks.getFileBuffer.mockResolvedValue(Buffer.from(JSON.stringify(collectionGraph)));
    executionService.processList.mockResolvedValue([{
      _id: 'execution-instance-1',
      fields: {
        executionId: 'execution-1', graphId: 'graph.document', graphRevision: 'rev-01',
        graphDocument: { type: 'graph-document', id: 'graph-instance-1' },
        status: 'succeeded', outputs: { document: [{ type: 'part', id: 'item-1' }] }, completedAt: '2026-11-16T10:00:01Z'
      }
    }]);
    const result = await graphExecutionsService.listCollectionOutputs(auth);
    expect(result).toEqual([expect.objectContaining({
      executionInstanceId: 'execution-instance-1', executionId: 'execution-1',
      graphDocumentInstanceId: 'graph-instance-1', graphId: 'graph.document',
      graphRevision: 'rev-01', outputId: 'document', label: 'Document', count: 1
    })]);
  });

  it('rejects a pinned collection whose authored graph identity differs from its execution', async () => {
    executionService.processGetById.mockResolvedValue({ _id: 'execution-instance-1', fields: { status: 'succeeded', graphDocument: { id: 'graph-instance-1' }, graphId: 'graph.document', graphRevision: 'rev-01' } });
    await expect(graphExecutionsService.resolveCollectionOutput('execution-instance-1', 'document', auth, { graphId: 'another.graph', graphRevision: 'rev-01', graphDocumentInstanceId: 'graph-instance-1' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('resolves pinned graph collection values through each target read grant', async () => {
    const collectionGraph = graph();
    collectionGraph.interface.outputs[0].contract.shape = 'list';
    mocks.getFileBuffer.mockResolvedValue(Buffer.from(JSON.stringify(collectionGraph)));
    executionService.processGetById.mockResolvedValue({
      _id: 'execution-instance-1',
      fields: {
        executionId: 'execution-1', graphId: 'graph.document', graphRevision: 'rev-01',
        graphDocument: { type: 'graph-document', id: 'graph-instance-1' },
        status: 'succeeded', outputs: { document: [{ type: 'part', id: 'item-1' }, { type: 'part', id: 'hidden' }] }
      }
    });
    payloadService.processGetById = vi.fn(async id => {
      if (id === 'hidden') throw Object.assign(new Error('denied'), { statusCode: 403 });
      return { _id: id, type: 'part', fields: { code: 'A' } };
    });
    const result = await graphExecutionsService.resolveCollectionOutput('execution-instance-1', 'document', auth);
    expect(result).toMatchObject({ executionId: 'execution-1', resultPolicy: 'pinned', graph: { id: 'graph.document', revision: 'rev-01' } });
    expect(result.items).toEqual([
      { kind: 'instance', typeId: 'part', instanceId: 'item-1', instance: { _id: 'item-1', type: 'part', fields: { code: 'A' } } },
      { kind: 'unavailable' }
    ]);
  });

  it('queries through the authorized instance read boundary and records snapshot read evidence', async () => {
    const result = await graphExecutionsService.queryOrganizationData({
      typeId: 'part',
      filters: { code: 'A' },
      sortBy: 'createdAt',
      sortDirection: 'desc',
      limit: 25,
      offset: 5,
      projection: ['fields.code']
    }, auth);
    expect(dataService.processList).toHaveBeenCalledWith({
      code: 'A', sortBy: 'createdAt', sortDirection: 'desc', limit: 25, offset: 5
    }, auth, { session: undefined });
    expect(mocks.withOrganizationDataSnapshot).toHaveBeenCalledWith('org-1', expect.any(Function), { retries: 2 });
    expect(result.items).toEqual([expect.objectContaining({
      _id: 'item-1', type: 'part', revision: 3, fields: { code: 'A' }
    })]);
    expect(result.count).toBe(1);
    expect(result.readSet).toMatchObject({
      consistency: 'snapshot',
      snapshotId: 'snapshot-42',
      organizationSequenceStart: 4,
      organizationSequenceEnd: 4,
      instances: [{ typeId: 'part', instanceId: 'item-1', revision: '3', typeVersion: 2 }],
      queries: [{ typeId: 'part', resultIds: ['item-1'], observedTotal: 1, sequence: 4 }]
    });
  });

  it('selects one exact CTS instance through its authorized detail read boundary', async () => {
    const result = await graphExecutionsService.queryOrganizationData({
      typeId: 'part',
      instanceId: 'item-1',
      projection: ['fields.code']
    }, auth);
    expect(dataService.processGetById).toHaveBeenCalledWith('item-1', auth, { session: undefined });
    expect(dataService.processList).not.toHaveBeenCalled();
    expect(result.items).toEqual([expect.objectContaining({
      _id: 'item-1',
      type: 'part',
      fields: { code: 'A' }
    })]);
    expect(result.readSet.queries).toEqual([expect.objectContaining({
      typeId: 'part',
      query: { typeId: 'part', instanceId: 'item-1', projection: ['fields.code'] },
      resultIds: ['item-1'],
      observedTotal: 1,
      sequence: 4
    })]);
  });

  it('commits an exact-instance patch proposal with its expected revision and records provenance', async () => {
    const result = await graphExecutionsService.commitOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: patchProposalPreview(),
      outputId: 'document'
    }, auth);

    expect(dataService.patch).toHaveBeenCalledWith('item-1', { fields: { code: 'B' } }, {
      auth, organizationId: 'org-1', expectedRevision: '3', expectedOrganizationSequence: 4, session
    });
    expect(result.execution).toMatchObject({
      profile: 'procedural-commit',
      status: 'succeeded',
      artifacts: [{
        kind: 'cts.instance',
        typeId: 'part',
        instanceId: 'item-1',
        revision: '4',
        sourceExecutionId: 'preview-1'
      }]
    });
    expect(executionService.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.objectContaining({ profile: 'procedural-commit', status: 'succeeded' })
    }), 'user-1', 'org-1', { session });
    expect(session.withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('refuses Commit before mutation when Mongo transaction support is unavailable', async () => {
    mocks.connectDB.mockResolvedValue({});
    await expect(graphExecutionsService.commitOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: patchProposalPreview(),
      outputId: 'document'
    }, auth)).rejects.toMatchObject({ statusCode: 503 });
    expect(dataService.patch).not.toHaveBeenCalled();
    expect(executionService.create).not.toHaveBeenCalled();
  });

  it('fails the Commit transaction when execution evidence persistence fails', async () => {
    executionService.create.mockRejectedValue(new Error('evidence store unavailable'));
    await expect(graphExecutionsService.commitOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: patchProposalPreview(),
      outputId: 'document'
    }, auth)).rejects.toMatchObject({
      statusCode: 500,
      message: 'CTS update and graph execution evidence could not be committed atomically'
    });
    expect(dataService.patch).toHaveBeenCalled();
    expect(executionService.create).toHaveBeenCalled();
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale target revision before the authoritative patch', async () => {
    dataService.processGetById.mockResolvedValue({
      _id: 'item-1', type: 'part', typeVersion: 2, organizationId: 'org-1',
      revision: 4, updatedAt: '2026-11-16T10:02:00Z', fields: { code: 'C' }
    });
    await expect(graphExecutionsService.commitOutput({
      graphDocumentInstanceId: 'graph-instance-1', record: patchProposalPreview(), outputId: 'document'
    }, auth)).rejects.toMatchObject({ statusCode: 409 });
    expect(dataService.patch).not.toHaveBeenCalled();
  });

  it('rejects broad query dependencies from an instance patch proposal', async () => {
    const record = patchProposalPreview({
      readSet: {
        consistency: 'sequence-bracketed',
        snapshotId: null,
        organizationSequenceStart: 4,
        organizationSequenceEnd: 4,
        instances: [{
          typeId: 'part', instanceId: 'item-1', revision: '3',
          updatedAt: '2026-11-16T10:00:00Z', typeVersion: 2, organizationId: 'org-1'
        }],
        relations: [],
        queries: [{
          typeId: 'part', organizationId: 'org-1',
          query: { typeId: 'part', filters: { code: 'A' } },
          resultIds: ['item-1'], observedTotal: 1, sequence: 4
        }]
      }
    });
    await expect(graphExecutionsService.commitOutput({
      graphDocumentInstanceId: 'graph-instance-1', record, outputId: 'document'
    }, auth)).rejects.toMatchObject({ statusCode: 409 });
    expect(dataService.patch).not.toHaveBeenCalled();
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

  it('refuses materialization when a query range has changed since preview', async () => {
    const record = createGraphExecutionRecord({
      ...preview(),
      readSet: {
        consistency: 'sequence-bracketed',
        snapshotId: null,
        organizationSequenceStart: 4,
        organizationSequenceEnd: 4,
        instances: [],
        relations: [],
        queries: [{
          typeId: 'part',
          organizationId: 'org-1',
          query: { typeId: 'part', limit: 50 },
          resultIds: ['item-1'],
          observedTotal: 1,
          sequence: 4
        }]
      }
    });
    mocks.withOrganizationChangeSequence.mockImplementation(async (_organizationId, read) => ({
      value: await read(),
      boundary: { consistency: 'sequence-bracketed', snapshotId: null, organizationSequenceStart: 5, organizationSequenceEnd: 5 }
    }));
    await expect(graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      outputId: 'document',
      destination: { type: 'page-file', pageId: 'page-1', path: 'exports/document.txt' }
    }, auth)).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.bakeFile).not.toHaveBeenCalled();
  });

  it('materializes plugin file payload envelopes with their declared MIME type and filename', async () => {
    const content = '# Generated Markdown\n';
    const record = createGraphExecutionRecord({
      ...preview(),
      outputs: { document: { payload: { base64: Buffer.from(content).toString('base64'), mime: 'text/markdown', name: 'generated.md' } } }
    });
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      outputId: 'document',
      destination: { type: 'page-file', pageId: 'page-1', path: 'exports/generated.md' }
    }, auth);
    expect(mocks.bakeFile).toHaveBeenCalledWith(expect.objectContaining({ buffer: Buffer.from(content), mimeType: 'text/markdown', path: 'exports/generated.md' }), auth);
    expect(result.file.fileId).toBe('baked-file-1');
  });

  it('bakes an output into an authorized revisioned instance payload atomically', async () => {
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: {
        type: 'instance-payload',
        typeId: 'part',
        instanceId: 'item-1',
        expectedRevision: '3'
      }
    }, auth);

    const revisions = await import('../instance-revisions/service.js');
    expect(revisions.ensureRevisionIndexes).toHaveBeenCalledTimes(1);
    expect(mocks.uploadFile).toHaveBeenCalledWith(
      Buffer.from('Generated document'),
      'Document graph-document.txt',
      { userId: 'user-1', organizationId: 'org-1', type: 'part' },
      'files',
      'text/plain; charset=utf-8'
    );
    expect(payloadService.replacePayload).toHaveBeenCalledWith('item-1', {
      buffer: Buffer.from('Generated document'),
      filename: 'Document graph-document.txt',
      mimeType: 'text/plain; charset=utf-8'
    }, expect.objectContaining({
      auth,
      userId: 'user-1',
      organizationId: 'org-1',
      session,
      expectedRevision: '3',
      expectedOrganizationSequence: 4,
      storedFile: { id: 'baked-payload-1', filename: 'Document graph-document.txt' }
    }));
    expect(executionService.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.objectContaining({
        profile: 'procedural-bake',
        artifacts: [expect.objectContaining({
          kind: 'instance-payload',
          typeId: 'part',
          instanceId: 'item-1',
          revision: '4',
          fileId: 'baked-payload-1',
          outputId: 'document'
        })]
      })
    }), 'user-1', 'org-1', { session });
    expect(result.instance.payload.fileId).toBe('baked-payload-1');
    expect(result.execution.profile).toBe('procedural-bake');
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it('bakes an output into a newly created, explicitly typed CTS instance', async () => {
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: {
        type: 'instance-create',
        typeId: 'part',
        draft: { name: 'Generated part', fields: { code: 'NEW-1' } }
      }
    }, auth);

    expect(payloadService.createForHttp).toHaveBeenCalledWith({
      name: 'Generated part',
      fields: { code: 'NEW-1' },
      payload: {
        fileId: 'baked-payload-1',
        mime: 'text/plain; charset=utf-8',
        size: Buffer.byteLength('Generated document'),
        name: 'Document graph-document.txt'
      }
    }, { auth, userId: 'user-1', organizationId: 'org-1', session, expectedOrganizationSequence: 4, requireRevisionedPayload: true });
    expect(executionService.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.objectContaining({
        profile: 'procedural-bake',
        artifacts: [expect.objectContaining({
          kind: 'instance-payload',
          typeId: 'part',
          instanceId: 'new-part-1',
          created: true,
          fileId: 'baked-payload-1'
        })]
      })
    }), 'user-1', 'org-1', { session });
    expect(result.instance._id).toBe('new-part-1');
    expect(result.execution.profile).toBe('procedural-bake');
  });

  it('bakes a Documents Markdown file payload into a text-document instance', async () => {
    const markdown = '# Generated document\n';
    const payload = {
      payload: {
        base64: Buffer.from(markdown).toString('base64'),
        mime: 'text/markdown',
        name: 'release.md'
      }
    };
    const record = createGraphExecutionRecord({
      ...preview(),
      outputs: { document: payload }
    });
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      outputId: 'document',
      destination: {
        type: 'instance-create',
        typeId: 'text-document',
        draft: { name: 'Release notes' }
      }
    }, auth);

    expect(mocks.uploadFile).toHaveBeenCalledWith(Buffer.from(markdown), 'release.md', {
      userId: 'user-1',
      organizationId: 'org-1',
      type: 'text-document'
    }, 'files', 'text/markdown');
    expect(payloadService.createForHttp).toHaveBeenCalledWith({
      name: 'Release notes',
      payload: {
        fileId: 'baked-payload-1',
        mime: 'text/markdown',
        size: Buffer.byteLength(markdown),
        name: 'release.md'
      }
    }, {
      auth,
      userId: 'user-1',
      organizationId: 'org-1',
      session,
      expectedOrganizationSequence: 4,
      requireRevisionedPayload: true
    });
    expect(result.instance._id).toBe('new-part-1');
    expect(result.execution.artifacts).toEqual([expect.objectContaining({
      kind: 'instance-payload',
      typeId: 'text-document',
      created: true,
      filename: 'release.md',
      mime: 'text/markdown'
    })]);
  });

  it('bakes a Documents HTML file payload into an html-document instance', async () => {
    const html = '<!doctype html><html><body><h1>Release</h1></body></html>';
    const record = createGraphExecutionRecord({
      ...preview(),
      outputs: {
        document: {
          payload: {
            base64: Buffer.from(html).toString('base64'),
            mime: 'text/html',
            name: 'release.html'
          }
        }
      }
    });
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      outputId: 'document',
      destination: {
        type: 'instance-create',
        typeId: 'html-document',
        draft: { name: 'Release HTML' }
      }
    }, auth);

    expect(mocks.uploadFile).toHaveBeenCalledWith(Buffer.from(html), 'release.html', {
      userId: 'user-1',
      organizationId: 'org-1',
      type: 'html-document'
    }, 'files', 'text/html');
    expect(payloadService.createForHttp).toHaveBeenCalledWith({
      name: 'Release HTML',
      payload: {
        fileId: 'baked-payload-1',
        mime: 'text/html',
        size: Buffer.byteLength(html),
        name: 'release.html'
      }
    }, expect.objectContaining({
      auth,
      userId: 'user-1',
      organizationId: 'org-1',
      session,
      requireRevisionedPayload: true
    }));
    expect(result.instance._id).toBe('new-part-1');
    expect(result.execution.artifacts).toEqual([expect.objectContaining({
      kind: 'instance-payload',
      typeId: 'html-document',
      created: true,
      filename: 'release.html',
      mime: 'text/html'
    })]);
  });

  it('bakes a Documents PDF file payload into a pdf-document instance', async () => {
    const pdf = Buffer.from('%PDF-1.7 generated document');
    const record = createGraphExecutionRecord({
      ...preview(),
      outputs: {
        document: {
          payload: {
            base64: pdf.toString('base64'),
            mime: 'application/pdf',
            name: 'release.pdf'
          }
        }
      }
    });
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      outputId: 'document',
      destination: {
        type: 'instance-create',
        typeId: 'pdf-document',
        draft: { name: 'Release PDF' }
      }
    }, auth);

    expect(mocks.uploadFile).toHaveBeenCalledWith(pdf, 'release.pdf', {
      userId: 'user-1',
      organizationId: 'org-1',
      type: 'pdf-document'
    }, 'files', 'application/pdf');
    expect(payloadService.createForHttp).toHaveBeenCalledWith({
      name: 'Release PDF',
      payload: {
        fileId: 'baked-payload-1',
        mime: 'application/pdf',
        size: pdf.length,
        name: 'release.pdf'
      }
    }, expect.objectContaining({
      auth,
      userId: 'user-1',
      organizationId: 'org-1',
      session,
      requireRevisionedPayload: true
    }));
    expect(result.instance._id).toBe('new-part-1');
    expect(result.execution.artifacts).toEqual([expect.objectContaining({
      kind: 'instance-payload',
      typeId: 'pdf-document',
      created: true,
      filename: 'release.pdf',
      mime: 'application/pdf'
    })]);
  });

  it('resolves a last-created-instance Bake selector from the exact preview query read set', async () => {
    const query = {
      typeId: 'part',
      filters: {},
      sortBy: 'createdAt',
      sortDirection: 'desc',
      limit: 1,
      offset: 0,
      projection: null
    };
    const record = createGraphExecutionRecord({
      ...preview(),
      readSet: {
        consistency: 'sequence-bracketed',
        snapshotId: null,
        organizationSequenceStart: 4,
        organizationSequenceEnd: 4,
        instances: [{
          typeId: 'part',
          instanceId: 'item-1',
          revision: '3',
          updatedAt: '2026-11-16T10:00:00Z',
          typeVersion: 2,
          organizationId: 'org-1'
        }],
        relations: [],
        queries: [{
          typeId: 'part',
          organizationId: 'org-1',
          query,
          resultIds: ['item-1'],
          observedTotal: 1,
          sequence: 4
        }]
      }
    });
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      outputId: 'document',
      destination: {
        type: 'instance-field',
        typeId: 'part',
        fieldId: 'attachment',
        selector: {
          query: { typeId: 'part', sortBy: 'createdAt', sortDirection: 'desc', limit: 1 },
          resultIndex: 0
        }
      }
    }, auth);

    expect(payloadService.patch).toHaveBeenCalledWith('item-1', expect.any(Object), expect.objectContaining({
      expectedRevision: '3',
      expectedOrganizationSequence: 4
    }));
    expect(result.execution.artifacts.at(-1)).toMatchObject({ instanceId: 'item-1', fieldId: 'attachment' });
  });

  it('rejects a Bake selector that was not observed by the preview', async () => {
    const record = createGraphExecutionRecord({
      ...preview(),
      readSet: {
        consistency: 'sequence-bracketed',
        snapshotId: null,
        organizationSequenceStart: 4,
        organizationSequenceEnd: 4,
        instances: [],
        relations: [],
        queries: []
      }
    });
    await expect(graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      outputId: 'document',
      destination: {
        type: 'instance-field',
        typeId: 'part',
        fieldId: 'attachment',
        selector: {
          query: {
            typeId: 'part',
            filters: {},
            sortBy: 'createdAt',
            sortDirection: 'desc',
            limit: 1,
            offset: 0,
            projection: null
          },
          resultIndex: 0
        }
      }
    }, auth)).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it('bakes a file into a new revisioned file instance and links it through a declared relation', async () => {
    mocks.declarationForType.mockImplementation(async typeId => typeId === 'file-record'
      ? { payload: { mime: ['text/plain'] }, revisions: 'content' }
      : { fields: { attachment: { base: 'blob' } } });
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: {
        type: 'instance-relation',
        typeId: 'part',
        instanceId: 'item-1',
        expectedRevision: '3',
        relationKey: 'attachments',
        fileTypeId: 'file-record'
      }
    }, auth);

    expect(fileService.createForHttp).toHaveBeenCalledWith(expect.objectContaining({
      name: expect.any(String),
      payload: { fileId: 'baked-payload-1', mime: 'text/plain; charset=utf-8', size: 18, name: expect.any(String) }
    }), expect.objectContaining({
      expectedOrganizationSequence: 4,
      requireRevisionedPayload: true,
      session
    }));
    expect(payloadService.linkRelationForHttp).toHaveBeenCalledWith('item-1', 'attachments', {
      type: 'file-record',
      id: 'file-record-1'
    }, expect.objectContaining({
      expectedRevision: '3',
      expectedOrganizationSequence: null,
      session
    }));
    expect(result.attachment._id).toBe('file-record-1');
    expect(result.execution.artifacts.at(-1)).toMatchObject({
      kind: 'instance-relation',
      typeId: 'part',
      instanceId: 'item-1',
      relationKey: 'attachments',
      fileTypeId: 'file-record',
      fileInstanceId: 'file-record-1',
      fileId: 'baked-payload-1'
    });
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it('refuses relation Bake when the selected file type lacks revisioned payload', async () => {
    mocks.declarationForType.mockResolvedValueOnce({ payload: { mime: ['text/plain'] } });
    await expect(graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: {
        type: 'instance-relation',
        typeId: 'part',
        instanceId: 'item-1',
        expectedRevision: '3',
        relationKey: 'attachments',
        fileTypeId: 'file-record'
      }
    }, auth)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(fileService.createForHttp).not.toHaveBeenCalled();
  });

  it('bakes an output into an explicitly declared Blob field on an exact CTS instance', async () => {
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: { type: 'instance-field', typeId: 'part', instanceId: 'item-1', fieldId: 'attachment', expectedRevision: '3' }
    }, auth);

    expect(mocks.declarationForType).toHaveBeenCalledWith('part', 'org-1');
    expect(mocks.uploadFile).toHaveBeenCalledWith(
      Buffer.from('Generated document'),
      expect.any(String),
      expect.objectContaining({ organizationId: 'org-1', type: 'part' }),
      'files',
      'text/plain; charset=utf-8'
    );
    expect(payloadService.patch).toHaveBeenCalledWith('item-1', {
      fields: { attachment: { fileId: 'baked-payload-1', mime: 'text/plain; charset=utf-8', size: 18 } }
    }, expect.objectContaining({ expectedRevision: '3', expectedOrganizationSequence: 4, session }));
    expect(result.instance.revision).toBe(4);
    expect(result.execution.artifacts.at(-1)).toMatchObject({
      kind: 'instance-field', typeId: 'part', instanceId: 'item-1', fieldId: 'attachment',
      fileId: 'baked-payload-1', conflictPolicy: 'fail'
    });
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it('does not bake a graph output into a Page in another active organization', async () => {
    graphService.processGetById.mockResolvedValueOnce({
      ...graphDocument,
      organizationId: 'org-2'
    });
    await expect(graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: { type: 'page-file', pageId: 'page-1', path: 'exports/document.txt' }
    }, auth)).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.bakeFile).not.toHaveBeenCalled();
  });

  it('refuses instance-field Bake unless the destination is a declared Blob field', async () => {
    mocks.declarationForType.mockResolvedValueOnce({ fields: { attachment: { base: 'string' } } });
    await expect(graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: { type: 'instance-field', typeId: 'part', instanceId: 'item-1', fieldId: 'attachment', expectedRevision: '3' }
    }, auth)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(payloadService.patch).not.toHaveBeenCalled();
  });

  it('rejects new-instance Bake drafts that can spoof tenancy or lifecycle', async () => {
    await expect(graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: {
        type: 'instance-create',
        typeId: 'part',
        draft: { name: 'Spoofed', organizationId: 'org-2' }
      }
    }, auth)).rejects.toMatchObject({ statusCode: 400 });
    await expect(graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: {
        type: 'instance-create',
        typeId: 'part',
        draft: { name: 'Forged state', state: 'approved' }
      }
    }, auth)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(payloadService.createForHttp).not.toHaveBeenCalled();
  });

  it('removes a pre-uploaded payload when atomic Bake evidence cannot be persisted', async () => {
    executionService.create.mockRejectedValueOnce(new Error('evidence write failed'));
    await expect(graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      destination: {
        type: 'instance-payload',
        typeId: 'part',
        instanceId: 'item-1',
        expectedRevision: '3'
      }
    }, auth)).rejects.toMatchObject({ statusCode: 500, message: 'CTS payload and graph execution evidence could not be committed atomically' });

    expect(mocks.deleteFile).toHaveBeenCalledWith('baked-payload-1', 'files');
  });

  it('refuses durable Bake when consumed instances lack a stable organization read boundary', async () => {
    const record = createGraphExecutionRecord({
      ...preview(),
      readSet: {
        consistency: 'unverified',
        snapshotId: null,
        organizationSequenceStart: null,
        organizationSequenceEnd: null,
        instances: [{
          typeId: 'part',
          instanceId: 'item-1',
          revision: '3',
          typeVersion: 2,
          organizationId: 'org-1'
        }],
        relations: [],
        queries: []
      }
    });
    await expect(graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      outputId: 'document',
      destination: { type: 'page-file', pageId: 'page-1', path: 'exports/document.txt' }
    }, auth)).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.bakeFile).not.toHaveBeenCalled();
  });

  it('refuses materialization when an instance revision changed after preview', async () => {
    const record = createGraphExecutionRecord({
      ...preview(),
      readSet: {
        consistency: 'unverified',
        snapshotId: null,
        organizationSequenceStart: null,
        organizationSequenceEnd: null,
        instances: [{
          typeId: 'part',
          instanceId: 'item-1',
          revision: '2',
          updatedAt: '2026-11-16T10:00:00Z',
          typeVersion: 2,
          organizationId: 'org-1'
        }],
        relations: [],
        queries: []
      }
    });
    await expect(graphExecutionsService.exportOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      outputId: 'document'
    }, auth)).rejects.toMatchObject({ statusCode: 409 });
    expect(executionService.create).not.toHaveBeenCalled();
  });

  it('bakes a selected output and records the destination as a procedural-bake execution', async () => {
    const result = await graphExecutionsService.bakeOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: createGraphExecutionRecord({
        ...preview(),
        readSet: {
          consistency: 'sequence-bracketed',
          snapshotId: null,
          organizationSequenceStart: 4,
          organizationSequenceEnd: 4,
          instances: [{
            typeId: 'part',
            instanceId: 'item-1',
            revision: '3',
            updatedAt: '2026-11-16T10:00:00Z',
            typeVersion: 2,
            organizationId: 'org-1'
          }],
          relations: [],
          queries: [{
            typeId: 'part',
            organizationId: 'org-1',
            query: { typeId: 'part', limit: 50 },
            resultIds: ['item-1'],
            observedTotal: 1,
            sequence: 4
          }]
        }
      }),
      outputId: 'document',
      destination: { type: 'page-file', pageId: 'page-1', path: 'exports/document.txt', conflictPolicy: 'fail' }
    }, auth);
    expect(mocks.bakeFile).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 'page-1',
      path: 'exports/document.txt',
      buffer: Buffer.from('Generated document'),
      expectedOrganizationSequence: 4,
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

  it('exports a selected output as a safe download and records procedural-export provenance', async () => {
    const result = await graphExecutionsService.exportOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: preview(),
      outputId: 'document',
      filename: '../generated\\r\\n.txt'
    }, auth);
    expect(result.buffer).toEqual(Buffer.from('Generated document'));
    expect(result.mimeType).toBe('text/plain; charset=utf-8');
    expect(result.filename).not.toMatch(/[\\/]/);
    expect(result.filename).not.toContain('\\r');
    expect(result.filename).not.toContain('\\n');
    expect(executionService.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.objectContaining({
        profile: 'procedural-export',
        artifacts: [expect.objectContaining({
          kind: 'download',
          outputId: 'document',
          sourceExecutionId: 'preview-1',
          mime: 'text/plain; charset=utf-8',
          size: Buffer.byteLength('Generated document')
        })]
      })
    }), 'user-1', 'org-1');
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

  it('commits one exact preview instance patch through the authorized revision-checked instance boundary', async () => {
    const record = createGraphExecutionRecord({
      ...preview(),
      readSet: {
        consistency: 'snapshot',
        snapshotId: 'snapshot-42',
        organizationSequenceStart: 4,
        organizationSequenceEnd: 4,
        instances: [{
          typeId: 'part',
          instanceId: 'item-1',
          revision: '3',
          updatedAt: '2026-11-16T10:00:00Z',
          typeVersion: 2,
          organizationId: 'org-1'
        }],
        relations: [],
        queries: [{
          typeId: 'part',
          organizationId: 'org-1',
          query: { typeId: 'part', instanceId: 'item-1', projection: null },
          resultIds: ['item-1'],
          observedTotal: 1,
          sequence: 4
        }]
      }
    });
    const result = await graphExecutionsService.commitProposal({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      proposal: {
        kind: 'cts.instance.patch',
        typeId: 'part',
        instanceId: 'item-1',
        expectedRevision: '3',
        conflictPolicy: 'fail',
        patch: { fields: { status: 'approved' } }
      }
    }, auth);
    expect(dataService.patch).toHaveBeenCalledWith('item-1', { fields: { status: 'approved' } }, {
      auth,
      organizationId: 'org-1',
      expectedRevision: '3',
      expectedOrganizationSequence: 4,
      session
    });
    expect(executionService.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.objectContaining({
        profile: 'procedural-commit',
        artifacts: [expect.objectContaining({
          kind: 'cts.instance',
          typeId: 'part',
          instanceId: 'item-1',
          revision: '4',
          sourceExecutionId: 'preview-1'
        })]
      })
    }), 'user-1', 'org-1', { session });
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(result.instance.revision).toBe(4);
  });

  it('rejects broad or mismatched read sets before a Commit write', async () => {
    const record = createGraphExecutionRecord({
      ...preview(),
      readSet: {
        consistency: 'unverified',
        snapshotId: null,
        organizationSequenceStart: null,
        organizationSequenceEnd: null,
        instances: [
          { typeId: 'part', instanceId: 'item-1', revision: '3', organizationId: 'org-1' },
          { typeId: 'part', instanceId: 'item-2', revision: '1', organizationId: 'org-1' }
        ],
        relations: [],
        queries: []
      }
    });
    await expect(graphExecutionsService.commitProposal({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      proposal: {
        kind: 'cts.instance.patch',
        typeId: 'part',
        instanceId: 'item-1',
        expectedRevision: '3',
        conflictPolicy: 'fail',
        patch: { fields: { status: 'approved' } }
      }
    }, auth)).rejects.toMatchObject({ statusCode: 409 });
    expect(dataService.patch).not.toHaveBeenCalled();
  });


  it('rejects Mongo-style field paths in Commit proposals before the write boundary', async () => {
    const record = createGraphExecutionRecord({
      ...preview(),
      readSet: {
        consistency: 'unverified',
        snapshotId: null,
        organizationSequenceStart: null,
        organizationSequenceEnd: null,
        instances: [{ typeId: 'part', instanceId: 'item-1', revision: '3', organizationId: 'org-1' }],
        relations: [],
        queries: []
      }
    });
    await expect(graphExecutionsService.commitProposal({
      graphDocumentInstanceId: 'graph-instance-1',
      record,
      proposal: {
        kind: 'cts.instance.patch',
        typeId: 'part',
        instanceId: 'item-1',
        expectedRevision: '3',
        conflictPolicy: 'fail',
        patch: { fields: { '$set.status': 'approved' } }
      }
    }, auth)).rejects.toMatchObject({ statusCode: 400 });
    expect(dataService.patch).not.toHaveBeenCalled();
  });

});
