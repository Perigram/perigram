import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_INVOKE_OPERATION,
  GRAPH_OUTPUT_OPERATION
} from '#packages/core';

// The real graph-executions evaluator and the real managed plugins service
// run together over a mocked task queue and install snapshot: the managed
// execution matrix legs the split-acceptance item names (pinned versions,
// nested graphs, authorized file reads, cancellation, timeout, partial
// failure, host-verified capability evidence).

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
  deleteFile: vi.fn()
}));

const taskQueue = vi.hoisted(() => ({ runs: new Map(), results: [], sequence: 0 }));

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
vi.mock('../pages/service.js', () => ({}));
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

const auth = { userId: 'user-1', organizationId: 'org-1' };

const REPORTS_RUNTIME = { id: 'reports-js', language: 'javascript', targets: ['browser', 'server'], entry: '/runtime.mjs' };
const PART_READ_PIN = { pluginId: 'reports', version: '12', runtimeId: 'reports-js', operationId: 'part.read' };
const PART_TRANSFORM_PIN = { pluginId: 'reports', version: '12', runtimeId: 'reports-js', operationId: 'part.transform' };

const reportsInstall = () => ({
  pluginId: 'reports',
  version: '12',
  services: [
    {
      id: 'part.read',
      nodeVersion: '1',
      label: 'Read a part',
      signature: {
        input: { base: 'record', fields: { target: { base: 'json', label: 'Target' } } },
        output: { base: 'json', label: 'Instance' }
      },
      palette: { group: 'reports' },
      execution: { runtime: 'reports-js', targets: ['browser', 'server'], kind: 'read', capabilities: ['organization.instances.read'] }
    },
    {
      id: 'part.transform',
      nodeVersion: '1',
      label: 'Transform a part value',
      signature: {
        input: { base: 'record', fields: { instance: { base: 'json', label: 'Instance' } } },
        output: { base: 'json', label: 'Value' }
      },
      palette: { group: 'reports' },
      execution: { runtime: 'reports-js', targets: ['browser', 'server'], kind: 'pure', capabilities: [] }
    },
    {
      id: 'part.flag',
      nodeVersion: '1',
      label: 'Flag a part',
      signature: {
        input: { base: 'record', fields: { instance: { base: 'json', label: 'Instance' } } },
        output: { base: 'json', label: 'Value' }
      },
      palette: { group: 'reports' },
      execution: { runtime: 'reports-js', targets: ['server'], kind: 'effect', capabilities: ['organization.instances.update'] }
    },
    {
      id: 'part.legacy',
      nodeVersion: '1',
      label: 'Legacy projection read',
      signature: {
        input: { base: 'record', fields: { instance: { base: 'json', label: 'Instance' } } },
        output: { base: 'json', label: 'Value' }
      },
      palette: { group: 'reports' },
      execution: { runtime: 'reports-js', targets: ['server'], kind: 'pure', capabilities: ['documents:read'] }
    }
  ],
  declarations: { runtimes: [REPORTS_RUNTIME] }
});

const partInstance = () => ({
  _id: 'item-1',
  type: 'part',
  typeVersion: 2,
  organizationId: 'org-1',
  revision: 3,
  updatedAt: '2026-11-19T10:00:00Z',
  fields: { code: 'A' }
});

const capabilityReadSet = () => ({
  consistency: 'snapshot',
  snapshotId: 'snap-7',
  organizationSequenceStart: 7,
  organizationSequenceEnd: 7,
  instances: [{
    typeId: 'part',
    instanceId: 'item-1',
    revision: '3',
    updatedAt: '2026-11-19T10:00:00Z',
    typeVersion: 2,
    organizationId: 'org-1'
  }],
  relations: [],
  queries: [{
    typeId: 'part',
    organizationId: 'org-1',
    query: { typeId: 'part', instanceId: 'item-1' },
    resultIds: ['item-1'],
    observedTotal: 1,
    sequence: 7
  }]
});

const graphWithOperation = ({ nodeId = 'read-part', operationId = 'part.read', inputPort = 'target', extraNodes = [], extraEdges = [] } = {}) => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: GRAPH_DOCUMENT_VERSION,
  id: 'graph.managed',
  revision: 'rev-01',
  name: 'Managed execution matrix',
  interface: {
    inputs: [{ id: 'target', label: 'Target', contract: { shape: 'item', semantic: { base: 'json' } } }],
    outputs: [{ id: 'result', label: 'Result', contract: { shape: 'item', semantic: { base: 'json' } } }]
  },
  nodes: [
    { id: 'input-target', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'target' } },
    { id: nodeId, operation: { provider: 'plugin.reports', id: operationId, version: '1' }, config: {} },
    ...extraNodes,
    { id: 'output-result', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
  ],
  edges: [
    { id: 'edge-target', source: { node: 'input-target', port: 'value' }, target: { node: nodeId, port: inputPort } },
    ...extraEdges,
    { id: 'edge-result', source: { node: nodeId, port: 'value' }, target: { node: 'output-result', port: 'value' } }
  ]
});

// One prepared result per enqueued managed task, consumed in order:
// { output } completes, { error } fails the task, { hang: true } stays running.
const queueTaskResult = result => taskQueue.results.push(result);

describe('managed server graph execution matrix', () => {
  const graphService = { processGetById: vi.fn(), processList: vi.fn() };
  const executionService = { create: vi.fn(async () => ({ _id: 'execution-instance-1' })) };
  const partService = { processGetById: vi.fn(), processList: vi.fn(), patch: vi.fn() };
  const graphDocument = {
    _id: 'graph-instance-1',
    organizationId: 'org-1',
    fields: { graphId: 'graph.managed' },
    payload: { fileId: 'graph-file-1' }
  };

  const serveGraph = graph => {
    mocks.getFileBuffer.mockImplementation(async fileId => (
      fileId === 'graph-file-1' ? Buffer.from(JSON.stringify(graph)) : mocks.getFileBuffer.fallback?.(fileId) || Buffer.from('')
    ));
  };

  const preview = (graph, context = {}) => {
    serveGraph(graph);
    return graphExecutionsService.evaluateAndRecordSavedGraphPreview({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings: { target: { type: 'part', id: 'item-1' } },
      context
    }, auth);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete mocks.getFileBuffer.fallback;
    taskQueue.runs.clear();
    taskQueue.results = [];
    taskQueue.sequence = 0;
    mocks.findInstall.mockResolvedValue(reportsInstall());
    mocks.getTaskRunById.mockImplementation(async id => taskQueue.runs.get(String(id)) || null);
    mocks.enqueueTask.mockImplementation(async (taskId, input, runAuth, options) => {
      taskQueue.sequence += 1;
      const run = {
        _id: `run-${taskQueue.sequence}`,
        taskId,
        input,
        status: 'RUNNING',
        claimToken: `claim-${taskQueue.sequence}`,
        workerType: options?.workerType
      };
      const prepared = taskQueue.results[taskQueue.sequence - 1];
      if (prepared?.error) {
        run.status = 'FAILED';
        run.error = { message: prepared.error };
      } else if (prepared && !prepared.hang) {
        run.status = 'SUCCEEDED';
        run.output = { ok: true, data: { output: prepared.output, capabilityEvidence: prepared.capabilityEvidence || [] } };
        if (prepared.hostCapabilityEvidence) run.hostCapabilityEvidence = prepared.hostCapabilityEvidence;
      }
      taskQueue.runs.set(String(run._id), run);
      return run;
    });
    mocks.cancelTaskRun.mockImplementation(async id => {
      const run = taskQueue.runs.get(String(id));
      if (run) run.status = 'CANCELLED';
      return run;
    });
    mocks.getAppRegistry.mockReturnValue({
      getInstanceService: typeId => (typeId === 'graph-document' ? graphService
        : typeId === 'graph-execution' ? executionService
          : typeId === 'part' ? partService : null)
    });
    graphService.processGetById.mockResolvedValue(graphDocument);
    graphService.processList.mockResolvedValue([]);
    partService.processGetById.mockImplementation(async id => ({ ...partInstance(), _id: id }));
    partService.processList.mockResolvedValue([]);
    mocks.withOrganizationDataSnapshot.mockImplementation(async (_organizationId, read) => ({
      value: await read(),
      boundary: {
        consistency: 'snapshot',
        snapshotId: 'snap-7',
        organizationSequenceStart: 7,
        organizationSequenceEnd: 7
      }
    }));
    mocks.withOrganizationChangeSequence.mockImplementation(async (_organizationId, read) => ({
      value: await read(),
      boundary: {
        consistency: 'sequence-bracketed',
        snapshotId: null,
        organizationSequenceStart: 7,
        organizationSequenceEnd: 7
      }
    }));
    mocks.runOrganizationChange.mockImplementation(async (_organizationId, _metadata, mutate) => await mutate());
    mocks.connectDB.mockResolvedValue({
      client: { startSession: () => ({ withTransaction: async callback => await callback(), endSession: async () => {} }) },
      collection: () => ({})
    });
    mocks.findFileMeta.mockResolvedValue({ metadata: { organizationId: 'org-1' }, contentType: 'text/plain' });
    mocks.assertFileReadAccess.mockReturnValue(true);
    mocks.contentHash.mockImplementation(buffer => `sha256:${buffer.toString('utf8')}`);
    serveGraph(graphWithOperation({}));
  });

  it('executes pure/read nodes against the installed package pin and records it in provenance', async () => {
    queueTaskResult({ output: { value: 'read-ok' } });
    const { execution } = await preview(graphWithOperation({}));

    expect(mocks.enqueueTask).toHaveBeenCalledWith('plugin.reports.part.read', expect.objectContaining({
      parameters: { value: expect.objectContaining({
        pluginId: 'reports',
        version: '12',
        runtimeId: 'reports-js',
        operationId: 'part.read',
        input: expect.objectContaining({ mode: 'preview', nodeId: 'read-part' })
      }) }
    }), expect.objectContaining({ organizationId: 'org-1' }), expect.objectContaining({
      workerType: 'plugin-runtime',
      maxAttempts: 1,
      idempotencyKey: expect.stringMatching(/^graph-node:[^:]+:/)
    }));
    expect(execution).toMatchObject({
      profile: 'procedural-preview',
      status: 'succeeded',
      provenance: {
        providers: [{ ...PART_READ_PIN, operations: ['part.read'] }],
        nodes: [expect.objectContaining({
          nodeId: 'read-part',
          status: 'succeeded',
          executionKind: 'read',
          taskRunId: 'run-1',
          packagePin: PART_READ_PIN
        })],
        capabilities: [],
        unverifiedCapabilities: []
      }
    });
  });

  it('refuses execution when the installed package version moves after provider resolution', async () => {
    mocks.findInstall.mockImplementationOnce(async () => reportsInstall())
      .mockImplementationOnce(async () => ({ ...reportsInstall(), version: '13' }));
    queueTaskResult({ output: { value: 'unused' } });

    const { execution } = await preview(graphWithOperation({}));

    expect(execution.status).toBe('failed');
    expect(execution.diagnostics[0].message).toContain('Installed plugin package changed after graph provider resolution');
    expect(mocks.enqueueTask).not.toHaveBeenCalled();
  });

  it('merges host-verified read evidence from a nested Use Graph child into the parent envelope', async () => {
    const childGraph = {
      format: GRAPH_DOCUMENT_FORMAT,
      version: GRAPH_DOCUMENT_VERSION,
      id: 'graph.child',
      revision: 'child-r1',
      name: 'Child read graph',
      interface: {
        inputs: [{ id: 'target', label: 'Target', contract: { shape: 'item', semantic: { base: 'json' } } }],
        outputs: [{ id: 'result', label: 'Result', contract: { shape: 'item', semantic: { base: 'json' } } }]
      },
      nodes: [
        { id: 'input-target', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'target' } },
        { id: 'child-read', operation: { provider: 'plugin.reports', id: 'part.read', version: '1' }, config: {} },
        { id: 'output-result', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
      ],
      edges: [
        { id: 'edge-target', source: { node: 'input-target', port: 'value' }, target: { node: 'child-read', port: 'target' } },
        { id: 'edge-result', source: { node: 'child-read', port: 'value' }, target: { node: 'output-result', port: 'value' } }
      ]
    };
    const parent = {
      format: GRAPH_DOCUMENT_FORMAT,
      version: GRAPH_DOCUMENT_VERSION,
      id: 'graph.managed',
      revision: 'rev-01',
      name: 'Managed nested invocation',
      interface: {
        inputs: [{ id: 'target', label: 'Target', contract: { shape: 'item', semantic: { base: 'json' } } }],
        outputs: [{ id: 'result', label: 'Result', contract: { shape: 'item', semantic: { base: 'json' } } }]
      },
      nodes: [
        { id: 'input-target', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'target' } },
        { id: 'use-child', operation: { provider: 'perigram.core', id: GRAPH_INVOKE_OPERATION, version: '1' }, config: { graphId: 'graph.child', revision: 'child-r1' } },
        { id: 'output-result', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
      ],
      edges: [
        { id: 'edge-target', source: { node: 'input-target', port: 'value' }, target: { node: 'use-child', port: 'target' } },
        { id: 'edge-result', source: { node: 'use-child', port: 'result' }, target: { node: 'output-result', port: 'value' } }
      ]
    };
    const childDocument = {
      _id: 'child-graph-instance-1',
      organizationId: 'org-1',
      fields: { graphId: 'graph.child' },
      payload: { fileId: 'child-file-1' }
    };
    graphService.processList.mockImplementation(async filters => (
      String(filters?.graphId) === 'graph.child' ? [childDocument] : []
    ));
    mocks.getFileBuffer.fallback = async () => Buffer.from(JSON.stringify(childGraph));
    const readSet = capabilityReadSet();
    queueTaskResult({
      output: { value: { code: 'A' } },
      capabilityEvidence: [{ name: 'organization.instances.read', input: { typeId: 'part', instanceId: 'item-1' }, readSet }],
      hostCapabilityEvidence: [{ name: 'organization.instances.read', input: { typeId: 'part', instanceId: 'item-1' }, readSet }]
    });

    const { execution } = await preview(parent);

    expect(execution.status).toBe('succeeded');
    expect(execution.outputs).toEqual({ result: { code: 'A' } });
    expect(execution.provenance.invocations).toEqual([expect.objectContaining({
      graphId: 'graph.child',
      graphRevision: 'child-r1',
      nodeId: 'use-child',
      invocationPath: [{ graphId: 'graph.managed', graphRevision: 'rev-01', nodeId: 'use-child' }]
    })]);
    expect(execution.provenance.nodes).toEqual([expect.objectContaining({
      nodeId: 'child-read',
      status: 'succeeded',
      executionKind: 'read',
      invocationPath: [
        { graphId: 'graph.managed', graphRevision: 'rev-01', nodeId: 'use-child' },
        { graphId: 'graph.child', graphRevision: 'child-r1', nodeId: 'child-read' }
      ]
    })]);
    expect(execution.provenance.capabilities).toEqual([expect.objectContaining({
      name: 'organization.instances.read',
      verified: true
    })]);
    expect(execution.provenance.unverifiedCapabilities).toEqual([]);
    expect(execution.readSet.instances).toEqual(readSet.instances);
    expect(execution.readSet.queries).toEqual(readSet.queries);
  });

  it('carries authorized file-read evidence into the read set and past Export', async () => {
    queueTaskResult({
      output: { value: 'file-content' },
      capabilityEvidence: [{ name: 'files.read', input: { fileId: 'file-2' }, organizationId: 'org-1', contentHash: 'sha256:file-2' }],
      hostCapabilityEvidence: [{ name: 'files.read', input: { fileId: 'file-2' }, organizationId: 'org-1', contentHash: 'sha256:file-2' }]
    });

    const { execution } = await preview(graphWithOperation({}));

    expect(execution.readSet.files).toEqual([{ fileId: 'file-2', contentHash: 'sha256:file-2', organizationId: 'org-1' }]);
    expect(execution.provenance.unverifiedCapabilities).toEqual([]);

    mocks.getFileBuffer.fallback = async fileId => (fileId === 'file-2' ? Buffer.from('file-2-bytes') : Buffer.from(''));
    mocks.contentHash.mockImplementation(buffer => (buffer.toString('utf8') === 'file-2-bytes' ? 'sha256:file-2' : `sha256:${buffer.toString('utf8')}`));
    const download = await graphExecutionsService.exportOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: execution,
      outputId: 'result'
    }, auth);
    expect(download.execution).toMatchObject({ _id: 'execution-instance-1' });
    expect(executionService.create).toHaveBeenLastCalledWith(expect.objectContaining({
      fields: expect.objectContaining({ profile: 'procedural-export', status: 'succeeded' })
    }), 'user-1', 'org-1');
  });

  it('keeps an authorized instance update unblocked through host-verified evidence', async () => {
    queueTaskResult({
      output: { value: 'updated' },
      capabilityEvidence: [{ name: 'organization.instances.update', input: { typeId: 'part', instanceId: 'item-1' } }],
      hostCapabilityEvidence: [{
        name: 'organization.instances.update',
        input: { typeId: 'part', instanceId: 'item-1', expectedRevision: '3' },
        organizationId: 'org-1',
        instance: { instanceId: 'item-1', revision: 4 }
      }]
    });

    const { execution } = await preview(graphWithOperation({}));

    expect(execution.provenance.capabilities).toEqual([expect.objectContaining({
      name: 'organization.instances.update',
      verified: true,
      instance: { instanceId: 'item-1', revision: 4 }
    })]);
    expect(execution.provenance.unverifiedCapabilities).toEqual([]);

    const download = await graphExecutionsService.exportOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: execution,
      outputId: 'result'
    }, auth);
    expect(executionService.create).toHaveBeenLastCalledWith(expect.objectContaining({
      fields: expect.objectContaining({ profile: 'procedural-export', status: 'succeeded' })
    }), 'user-1', 'org-1');
  });

  it('marks worker-claimed evidence without a host journal unverified and refuses Export', async () => {
    const readSet = capabilityReadSet();
    queueTaskResult({
      output: { value: 'claimed' },
      capabilityEvidence: [{ name: 'organization.instances.read', input: { typeId: 'part', instanceId: 'item-1' }, readSet }]
    });

    const { execution } = await preview(graphWithOperation({}));

    expect(execution.provenance.capabilities).toEqual([expect.objectContaining({ name: 'organization.instances.read' })]);
    expect(execution.provenance.capabilities[0].verified).toBeUndefined();
    expect(execution.provenance.unverifiedCapabilities).toEqual(['organization.instances.read']);
    expect(execution.readSet.instances).toEqual([]);

    await expect(graphExecutionsService.exportOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: execution,
      outputId: 'result'
    }, auth)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('organization.instances.read')
    });
    expect(executionService.create).toHaveBeenCalledTimes(1);
  });

  it('marks capabilities outside the host adapter set unverified even after a successful preview', async () => {
    queueTaskResult({ output: { value: 'legacy' } });

    const { execution } = await preview(graphWithOperation({ nodeId: 'legacy-part', operationId: 'part.legacy', inputPort: 'instance' }));

    expect(execution.status).toBe('succeeded');
    expect(execution.provenance.unverifiedCapabilities).toEqual(['documents:read']);
    await expect(graphExecutionsService.exportOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: execution,
      outputId: 'result'
    }, auth)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('documents:read')
    });
  });

  it('refuses proposal/effect/stateful node kinds before any managed task starts', async () => {
    const { execution } = await preview(graphWithOperation({ nodeId: 'flag-part', operationId: 'part.flag', inputPort: 'instance' }));

    expect(execution.status).toBe('failed');
    expect(execution.diagnostics[0].message).toContain('Preview cannot execute effect node flag-part');
    expect(mocks.enqueueTask).not.toHaveBeenCalled();
    expect(execution.provenance.nodes).toEqual([]);
  });

  it('cancels in-flight node tasks when the graph aborts and persists a cancelled preview without durable writes', async () => {
    const controller = new AbortController();
    mocks.getTaskRunById.mockImplementation(async id => {
      const run = taskQueue.runs.get(String(id));
      if (run && run.status === 'RUNNING') controller.abort('graph cancelled');
      return run;
    });
    queueTaskResult({ hang: true });

    const { execution } = await preview(graphWithOperation({}), { signal: controller.signal });

    expect(execution.status).toBe('cancelled');
    expect(execution.provenance.nodes).toEqual([expect.objectContaining({
      nodeId: 'read-part',
      status: 'cancelled',
      taskRunId: 'run-1',
      error: expect.stringContaining('graph cancelled')
    })]);
    expect(mocks.cancelTaskRun).toHaveBeenCalledWith('run-1', expect.any(String));
    expect(partService.patch).not.toHaveBeenCalled();
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(executionService.create).toHaveBeenCalledTimes(1);
  });

  it('times out a hanging node task at the graph deadline and persists the failed preview', async () => {
    queueTaskResult({ hang: true });

    const { execution } = await preview(graphWithOperation({}), { maxExecutionMs: 1000 });

    expect(execution.status).toBe('failed');
    expect(execution.provenance.nodes).toEqual([expect.objectContaining({
      nodeId: 'read-part',
      status: 'timed-out',
      taskRunId: 'run-1'
    })]);
    expect(execution.diagnostics[0].message).toContain('deadline');
    expect(mocks.cancelTaskRun).toHaveBeenCalledWith('run-1', expect.any(String));
    expect(executionService.create).toHaveBeenCalledTimes(1);
  }, 15000);

  it('skips downstream nodes after a partial failure and keeps the completed read evidence consistent', async () => {
    const graph = {
      format: GRAPH_DOCUMENT_FORMAT,
      version: GRAPH_DOCUMENT_VERSION,
      id: 'graph.managed',
      revision: 'rev-01',
      name: 'Managed partial failure',
      interface: {
        inputs: [{ id: 'target', label: 'Target', contract: { shape: 'item', semantic: { base: 'json' } } }],
        outputs: [{ id: 'result', label: 'Result', contract: { shape: 'item', semantic: { base: 'json' } } }]
      },
      nodes: [
        { id: 'input-target', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'target' } },
        { id: 'read-part', operation: { provider: 'plugin.reports', id: 'part.read', version: '1' }, config: {} },
        { id: 'transform-part', operation: { provider: 'plugin.reports', id: 'part.transform', version: '1' }, config: {} },
        { id: 'output-result', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
      ],
      edges: [
        { id: 'edge-target', source: { node: 'input-target', port: 'value' }, target: { node: 'read-part', port: 'target' } },
        { id: 'edge-instance', source: { node: 'read-part', port: 'value' }, target: { node: 'transform-part', port: 'instance' } },
        { id: 'edge-result', source: { node: 'transform-part', port: 'value' }, target: { node: 'output-result', port: 'value' } }
      ]
    };
    const readSet = capabilityReadSet();
    queueTaskResult({
      output: { value: partInstance() },
      capabilityEvidence: [{ name: 'organization.instances.read', input: { typeId: 'part', instanceId: 'item-1' }, readSet }],
      hostCapabilityEvidence: [{ name: 'organization.instances.read', input: { typeId: 'part', instanceId: 'item-1' }, readSet }]
    });
    queueTaskResult({ error: 'transform worker exploded' });

    const { execution } = await preview(graph);

    expect(execution.status).toBe('failed');
    expect(execution.outputs).toEqual({});
    expect(execution.diagnostics[0].message).toContain('transform worker exploded');
    expect(execution.provenance.nodes).toEqual([
      expect.objectContaining({ nodeId: 'read-part', status: 'succeeded', executionKind: 'read' }),
      expect.objectContaining({ nodeId: 'transform-part', status: 'failed', executionKind: 'pure', error: 'transform worker exploded' })
    ]);
    expect(mocks.enqueueTask).toHaveBeenCalledTimes(2);
    expect(execution.readSet.instances).toEqual(readSet.instances);
    expect(execution.provenance.unverifiedCapabilities).toEqual([]);
    expect(partService.patch).not.toHaveBeenCalled();
  });
});
