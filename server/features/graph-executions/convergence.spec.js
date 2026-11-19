import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION
} from '#packages/core';

const mocks = vi.hoisted(() => ({
  getAppRegistry: vi.fn(),
  findFileMeta: vi.fn(),
  assertFileReadAccess: vi.fn(),
  getFileBuffer: vi.fn(),
  contentHash: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  bakeFile: vi.fn(),
  retractBakedFile: vi.fn(),
  withOrganizationDataSnapshot: vi.fn(),
  ensureOrganizationChangeIndexes: vi.fn(),
  withOrganizationChangeSequence: vi.fn(),
  connectDB: vi.fn(),
  declarationForType: vi.fn(),
  runOrganizationChange: vi.fn(),
  resolveInstalledGraphNodeDefinition: vi.fn(),
  executeManagedGraphNode: vi.fn()
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
vi.mock('../plugins/service.js', () => ({
  resolveInstalledGraphNodeDefinition: mocks.resolveInstalledGraphNodeDefinition,
  executeManagedGraphNode: mocks.executeManagedGraphNode
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

const PART_READ_PIN = { pluginId: 'reports', version: '12', runtimeId: 'reports-worker', operationId: 'part.read' };
const APPROVAL_PIN = { pluginId: 'reports', version: '12', runtimeId: 'reports-js', operationId: 'approval.compose' };

const partReadDefinition = () => ({
  provider: 'plugin.reports',
  id: 'part.read',
  version: '1',
  label: 'Read a part instance',
  execution: { kind: 'read', targets: ['browser', 'server'], capabilities: ['organization.instances.read'], deterministic: true, idempotent: true },
  inputs: [{ id: 'target', required: true, shape: 'item', semantic: { base: 'entityRef' } }],
  outputs: [{ id: 'instance', required: true, shape: 'item', semantic: { base: 'json' } }],
  packagePin: PART_READ_PIN
});

const approvalComposeDefinition = () => ({
  provider: 'plugin.reports',
  id: 'approval.compose',
  version: '2',
  label: 'Compose part approval patch',
  execution: { kind: 'pure', targets: ['browser', 'server'], capabilities: [], deterministic: true, idempotent: true },
  inputs: [{ id: 'instance', required: true, shape: 'item', semantic: { base: 'json' } }],
  outputs: [
    { id: 'proposal', required: true, shape: 'item', semantic: { base: 'json' } },
    { id: 'measurement', required: true, shape: 'item', semantic: { base: 'number', unit: 'mm' } }
  ],
  packagePin: APPROVAL_PIN
});

// Mirrors the managed runtime's capability read-set merge in the plugins service.
const mergeReadEvidence = (recorder, readSet = {}) => {
  if (readSet.consistency) {
    recorder.setConsistency({
      consistency: readSet.consistency,
      snapshotId: readSet.snapshotId,
      organizationSequenceStart: readSet.organizationSequenceStart,
      organizationSequenceEnd: readSet.organizationSequenceEnd
    });
  }
  for (const instance of readSet.instances || []) recorder.recordInstance(instance);
  for (const relation of readSet.relations || []) recorder.recordRelation(relation);
  for (const query of readSet.queries || []) recorder.recordQuery(query);
};

const managedPluginRuntime = () => vi.fn(async (definition, invocation) => {
  if (definition.id === 'part.read') {
    const response = await invocation.context.data.queryInstances({
      typeId: invocation.inputs.target.type,
      instanceId: invocation.inputs.target.id
    });
    mergeReadEvidence(invocation.context.readSet, response.readSet);
    return { instance: response.items[0] };
  }
  return {
    proposal: {
      kind: 'cts.instance.patch',
      typeId: 'part',
      instanceId: String(invocation.inputs.instance._id),
      expectedRevision: String(invocation.inputs.instance.revision),
      conflictPolicy: 'fail',
      patch: { fields: { code: 'B' } }
    },
    measurement: 1
  };
});

const convergenceGraph = ({ measureUnit = 'mm' } = {}) => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: GRAPH_DOCUMENT_VERSION,
  id: 'graph.document',
  revision: 'rev-01',
  name: 'Part approval slice',
  interface: {
    inputs: [{ id: 'target', label: 'Target', contract: { shape: 'item', semantic: { base: 'entityRef' } } }],
    outputs: [
      { id: 'proposal', label: 'Proposal', contract: { shape: 'item', semantic: { base: 'json' } } },
      { id: 'measurement', label: 'Measurement', contract: { shape: 'item', semantic: { base: 'number', unit: measureUnit } } }
    ]
  },
  nodes: [
    { id: 'input-target', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'target' } },
    { id: 'read-part', operation: { provider: 'plugin.reports', id: 'part.read', version: '1' }, config: {} },
    { id: 'compose-approval', operation: { provider: 'plugin.reports', id: 'approval.compose', version: '2' }, config: {} },
    { id: 'output-proposal', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'proposal' } },
    { id: 'output-measurement', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'measurement' } }
  ],
  edges: [
    { id: 'edge-target', source: { node: 'input-target', port: 'value' }, target: { node: 'read-part', port: 'target' } },
    { id: 'edge-instance', source: { node: 'read-part', port: 'instance' }, target: { node: 'compose-approval', port: 'instance' } },
    { id: 'edge-proposal', source: { node: 'compose-approval', port: 'proposal' }, target: { node: 'output-proposal', port: 'value' } },
    { id: 'edge-measurement', source: { node: 'compose-approval', port: 'measurement' }, target: { node: 'output-measurement', port: 'value' } }
  ]
});

describe('SPEC §30.13 required convergence proof', () => {
  const auth = { userId: 'user-1', organizationId: 'org-1' };
  const graphDocument = {
    _id: 'graph-instance-1',
    organizationId: 'org-1',
    fields: { graphId: 'graph.document' },
    payload: { fileId: 'graph-file-1' }
  };
  const partInstance = id => ({
    _id: id,
    type: 'part',
    typeVersion: 2,
    organizationId: 'org-1',
    revision: 3,
    updatedAt: '2026-11-16T10:00:00Z',
    fields: { code: 'A' }
  });
  const graphService = { processGetById: vi.fn(), processList: vi.fn() };
  const executionService = { create: vi.fn(), processList: vi.fn(), processGetById: vi.fn() };
  const dataService = { processList: vi.fn(), processGetById: vi.fn(), patch: vi.fn() };
  const partService = {
    processGetById: (...args) => dataService.processGetById(...args),
    patch: (...args) => dataService.patch(...args)
  };
  const session = {
    withTransaction: vi.fn(async callback => await callback()),
    endSession: vi.fn(async () => {})
  };

  const previewSlice = () => graphExecutionsService.evaluateAndRecordSavedGraphPreview({
    graphDocumentInstanceId: 'graph-instance-1',
    inputBindings: { target: { type: 'part', id: 'item-1' } },
    executeManagedNode: managedPluginRuntime()
  }, auth);

  beforeEach(() => {
    vi.clearAllMocks();
    session.withTransaction.mockImplementation(async callback => await callback());
    mocks.connectDB.mockResolvedValue({ client: { startSession: () => session } });
    graphService.processGetById.mockResolvedValue(graphDocument);
    graphService.processList.mockResolvedValue([]);
    executionService.create.mockResolvedValue({ _id: 'execution-instance-1' });
    executionService.processList.mockResolvedValue([]);
    executionService.processGetById.mockResolvedValue(null);
    mocks.getAppRegistry.mockReturnValue({
      getInstanceService: typeId => typeId === 'graph-document' ? graphService
        : typeId === 'graph-execution' ? executionService
        : typeId === 'part' ? partService
        : dataService
    });
    dataService.processGetById.mockImplementation(async id => partInstance(id));
    dataService.processList.mockResolvedValue([]);
    dataService.patch.mockResolvedValue({ _id: 'item-1', type: 'part', typeVersion: 2, organizationId: 'org-1', revision: 4, updatedAt: '2026-11-16T10:01:00Z', fields: { code: 'B' } });
    mocks.resolveInstalledGraphNodeDefinition.mockImplementation(async operation => {
      if (operation.id === 'part.read') return partReadDefinition();
      if (operation.id === 'approval.compose') return approvalComposeDefinition();
      return null;
    });
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
    mocks.getFileBuffer.mockResolvedValue(Buffer.from(JSON.stringify(convergenceGraph())));
    mocks.contentHash.mockImplementation(buffer => `sha256:${buffer.toString('utf8')}`);
    mocks.uploadFile.mockResolvedValue({ id: 'baked-payload-1' });
    mocks.deleteFile.mockResolvedValue(true);
    mocks.bakeFile.mockResolvedValue({ page: { _id: 'page-1' }, file: { fileId: 'baked-file-1' } });
    mocks.retractBakedFile.mockResolvedValue({ success: true });
    mocks.declarationForType.mockResolvedValue({ fields: {} });
  });

  it('composes installed read and pure plugin operations over an organization CTS type and previews without effects', async () => {
    const runtime = managedPluginRuntime();
    const result = await graphExecutionsService.evaluateAndRecordSavedGraphPreview({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings: { target: { type: 'part', id: 'item-1' } },
      executeManagedNode: runtime
    }, auth);

    expect(mocks.resolveInstalledGraphNodeDefinition).toHaveBeenCalledWith({ provider: 'plugin.reports', id: 'part.read', version: '1', auth });
    expect(mocks.resolveInstalledGraphNodeDefinition).toHaveBeenCalledWith({ provider: 'plugin.reports', id: 'approval.compose', version: '2', auth });
    expect(dataService.processGetById).toHaveBeenCalledWith('item-1', auth, { session: undefined });
    expect(dataService.processList).not.toHaveBeenCalled();
    expect(runtime).toHaveBeenCalledTimes(2);
    expect(runtime).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'part.read', packagePin: PART_READ_PIN }),
      expect.objectContaining({
        target: 'server',
        mode: 'preview',
        inputs: { target: { type: 'part', id: 'item-1' } },
        invocationPath: [{ graphId: 'graph.document', graphRevision: 'rev-01', nodeId: 'read-part' }],
        context: expect.objectContaining({
          executionId: expect.any(String),
          readSet: expect.anything(),
          data: expect.objectContaining({ queryInstances: expect.any(Function) })
        })
      }), auth);
    expect(runtime).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'approval.compose' }),
      expect.objectContaining({
        inputs: { instance: partInstance('item-1') },
        invocationPath: [{ graphId: 'graph.document', graphRevision: 'rev-01', nodeId: 'compose-approval' }]
      }), auth);

    expect(dataService.patch).not.toHaveBeenCalled();
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(mocks.bakeFile).not.toHaveBeenCalled();
    expect(executionService.create).toHaveBeenCalledTimes(1);

    expect(result.execution).toMatchObject({
      profile: 'procedural-preview',
      status: 'succeeded',
      graph: { id: 'graph.document', revision: 'rev-01' },
      outputs: {
        proposal: {
          kind: 'cts.instance.patch',
          typeId: 'part',
          instanceId: 'item-1',
          expectedRevision: '3',
          conflictPolicy: 'fail',
          patch: { fields: { code: 'B' } }
        },
        measurement: 1
      },
      diagnostics: [],
      provenance: {
        providers: [
          { ...PART_READ_PIN, operations: ['part.read'] },
          { ...APPROVAL_PIN, operations: ['approval.compose'] }
        ],
        nodes: [
          expect.objectContaining({ nodeId: 'read-part', status: 'succeeded', packagePin: PART_READ_PIN }),
          expect.objectContaining({ nodeId: 'compose-approval', status: 'succeeded', packagePin: APPROVAL_PIN })
        ],
        capabilities: [],
        unverifiedCapabilities: []
      },
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
    expect(result.instance).toMatchObject({ _id: 'execution-instance-1' });
  });

  it('commits the previewed patch proposal through the authorized CTS write boundary', async () => {
    const { execution: previewRecord } = await previewSlice();

    const result = await graphExecutionsService.commitOutput({
      graphDocumentInstanceId: 'graph-instance-1',
      record: previewRecord,
      outputId: 'proposal'
    }, auth);

    expect(dataService.patch).toHaveBeenCalledWith('item-1', { fields: { code: 'B' } }, {
      auth,
      organizationId: 'org-1',
      expectedRevision: '3',
      expectedOrganizationSequence: 4,
      session
    });
    expect(result.instance).toMatchObject({ _id: 'item-1', revision: 4, fields: { code: 'B' } });
    expect(result.execution).toMatchObject({
      profile: 'procedural-commit',
      status: 'succeeded',
      outputs: {
        proposal: {
          kind: 'cts.instance.patch',
          typeId: 'part',
          instanceId: 'item-1',
          expectedRevision: '3',
          committedRevision: '4',
          conflictPolicy: 'fail'
        }
      },
      artifacts: [{
        kind: 'cts.instance',
        typeId: 'part',
        instanceId: 'item-1',
        revision: '4',
        outputId: 'proposal',
        sourceExecutionId: previewRecord.id,
        conflictPolicy: 'fail'
      }]
    });
    expect(result.execution.provenance.invocations).toEqual([{
      kind: 'commit',
      provider: 'perigram.cts',
      operation: 'instance.patch',
      outputId: 'proposal',
      typeId: 'part',
      instanceId: 'item-1',
      expectedRevision: '3',
      committedRevision: '4'
    }]);
    expect(executionService.create).toHaveBeenCalledTimes(2);
    expect(executionService.create).toHaveBeenLastCalledWith(expect.objectContaining({
      fields: expect.objectContaining({
        profile: 'procedural-commit',
        status: 'succeeded',
        graphId: 'graph.document',
        graphRevision: 'rev-01'
      })
    }), 'user-1', 'org-1', { session });
    expect(session.withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('resolves edge semantics through the shared comparator and rejects an unconverted unit difference', async () => {
    mocks.getFileBuffer.mockResolvedValue(Buffer.from(JSON.stringify(convergenceGraph({ measureUnit: 'm' }))));
    const runtime = managedPluginRuntime();

    const rejection = await graphExecutionsService.evaluateSavedGraph({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings: { target: { type: 'part', id: 'item-1' } },
      executeManagedNode: runtime
    }, auth).catch(error => error);

    expect(rejection).toMatchObject({ statusCode: 400 });
    expect(rejection.message).toContain('Graph does not lower for server execution');
    expect(rejection.data.diagnostics).toEqual([expect.objectContaining({
      severity: 'error',
      phase: 'lowering',
      edgeId: 'edge-measurement',
      nodeId: 'compose-approval',
      portId: 'measurement'
    })]);
    expect(rejection.data.diagnostics[0].message).toContain('Unit mm requires conversion to m');
    expect(runtime).not.toHaveBeenCalled();
    expect(dataService.processGetById).not.toHaveBeenCalled();

    const { execution: failedRecord, instance } = await graphExecutionsService.evaluateAndRecordSavedGraphPreview({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings: { target: { type: 'part', id: 'item-1' } },
      executeManagedNode: runtime
    }, auth);
    expect(failedRecord).toMatchObject({
      profile: 'procedural-preview',
      status: 'failed',
      outputs: {},
      provenance: {
        providers: [
          { ...PART_READ_PIN, operations: ['part.read'] },
          { ...APPROVAL_PIN, operations: ['approval.compose'] }
        ]
      }
    });
    expect(failedRecord.diagnostics.some(item => item.message.includes('Unit mm requires conversion to m'))).toBe(true);
    expect(instance).toMatchObject({ _id: 'execution-instance-1' });
    expect(runtime).not.toHaveBeenCalled();
  });

  it('evaluates the same graph and inputs to equal outputs across repeated server runs', async () => {
    // Cross-target parity stays out of scope: the browser session runs no
    // server-side install resolver, so only the server target executes here.
    const evaluate = executionId => graphExecutionsService.evaluateSavedGraph({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings: { target: { type: 'part', id: 'item-1' } },
      executeManagedNode: managedPluginRuntime(),
      context: { executionId }
    }, auth);

    const first = await evaluate('parity-run-1');
    const second = await evaluate('parity-run-2');

    expect(second.executionId).not.toBe(first.executionId);
    expect(second.outputs).toEqual(first.outputs);
    expect(second.nodeOutputs).toEqual(first.nodeOutputs);
    expect(second.providerPins).toEqual(first.providerPins);
    expect(second.readSet.instances).toEqual(first.readSet.instances);
    expect(second.readSet.queries).toEqual(first.readSet.queries);
  });

  // Blocked: perigram.core.data/query.instances declares no execution.targets
  // and evaluateProceduralGraph refuses server nodes whose targets exclude
  // 'server' (packages/core/src/graph-data-provider.js needs
  // targets: ['browser', 'server']). Flip this test on when that lands.
  it('composes the core data provider operation with an installed plugin operation end to end', async () => {
    const coreDataGraph = {
      ...convergenceGraph(),
      interface: {
        inputs: [{ id: 'filters', label: 'Filters', contract: { shape: 'map', semantic: { base: 'json' } } }],
        outputs: convergenceGraph().interface.outputs
      },
      nodes: [
        { id: 'input-filters', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'filters' } },
        { id: 'query-parts', operation: { provider: 'perigram.core.data', id: 'query.instances', version: '1' }, config: { typeId: 'part', instanceId: 'item-1' } },
        convergenceGraph().nodes[2],
        convergenceGraph().nodes[3],
        convergenceGraph().nodes[4]
      ],
      edges: [
        { id: 'edge-filters', source: { node: 'input-filters', port: 'value' }, target: { node: 'query-parts', port: 'filters' } },
        { id: 'edge-items', source: { node: 'query-parts', port: 'items' }, target: { node: 'compose-approval', port: 'instance' } },
        convergenceGraph().edges[2],
        convergenceGraph().edges[3]
      ]
    };
    mocks.getFileBuffer.mockResolvedValue(Buffer.from(JSON.stringify(coreDataGraph)));
    mocks.resolveInstalledGraphNodeDefinition.mockResolvedValue({
      ...approvalComposeDefinition(),
      inputs: [{ id: 'instance', required: true, shape: 'list', semantic: { base: 'json' } }]
    });
    const runtime = vi.fn(async (_definition, invocation) => ({
      proposal: {
        kind: 'cts.instance.patch',
        typeId: 'part',
        instanceId: String(invocation.inputs.instance[0]._id),
        expectedRevision: String(invocation.inputs.instance[0].revision),
        conflictPolicy: 'fail',
        patch: { fields: { code: 'B' } }
      },
      measurement: 1
    }));

    const result = await graphExecutionsService.evaluateAndRecordSavedGraphPreview({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings: { filters: {} },
      executeManagedNode: runtime
    }, auth);

    expect(dataService.processGetById).toHaveBeenCalledWith('item-1', auth, { session: undefined });
    expect(runtime).toHaveBeenCalledWith(expect.objectContaining({ provider: 'plugin.reports', id: 'approval.compose' }),
      expect.objectContaining({ inputs: { instance: [partInstance('item-1')] }, target: 'server', mode: 'preview' }), auth);
    expect(result.execution).toMatchObject({
      profile: 'procedural-preview',
      status: 'succeeded',
      outputs: {
        proposal: { kind: 'cts.instance.patch', typeId: 'part', instanceId: 'item-1', expectedRevision: '3', conflictPolicy: 'fail', patch: { fields: { code: 'B' } } },
        measurement: 1
      }
    });
  });
});
