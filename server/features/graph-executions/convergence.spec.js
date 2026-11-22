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
  executeManagedGraphNode: vi.fn(),
  listInstalledGraphProviderConversions: vi.fn(),
  findByTypeId: vi.fn(),
  listByOrganization: vi.fn(),
  listDeclarationsByOrganization: vi.fn(),
  findDeclarationByTypeId: vi.fn(),
  hasInstanceAccess: vi.fn(),
  resolveActiveWorkflow: vi.fn(),
  publishEntityChanged: vi.fn(),
  sequenceGetOrganizationChangeSequence: vi.fn(),
  sequenceRecordOrganizationChange: vi.fn(),
  sequenceRunOrganizationChange: vi.fn(),
  sequenceWithOrganizationChangeSequence: vi.fn()
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
  executeManagedGraphNode: mocks.executeManagedGraphNode,
  listInstalledGraphProviderConversions: mocks.listInstalledGraphProviderConversions,
  executeConnectorService: vi.fn(),
  constructionsForOrganization: vi.fn(async () => ({}))
}));
vi.mock('../instance-revisions/service.js', () => ({
  ensureRevisionIndexes: vi.fn(async () => {}),
  ensureForEntitySnapshot: vi.fn(async () => ({ _id: 'rev-1', data: { number: 1 } }))
}));
vi.mock('../pages/service.js', () => ({
  bakeFile: mocks.bakeFile,
  retractBakedFile: mocks.retractBakedFile
}));
// The real generic instance service loads beside its declarationForType
// override: proof point 1 drives its create path with graph validation.
vi.mock('../instances/service.js', async importOriginal => ({
  ...(await importOriginal()),
  declarationForType: mocks.declarationForType
}));
vi.mock('../instances/index.js', () => ({
  ensureOrganizationChangeIndexes: mocks.ensureOrganizationChangeIndexes,
  withOrganizationDataSnapshot: mocks.withOrganizationDataSnapshot,
  withOrganizationChangeSequence: mocks.withOrganizationChangeSequence,
  runOrganizationChange: mocks.runOrganizationChange
}));
vi.mock('../instances/organization-sequence.js', () => ({
  getOrganizationChangeSequence: mocks.sequenceGetOrganizationChangeSequence,
  recordOrganizationChange: mocks.sequenceRecordOrganizationChange,
  runOrganizationChange: mocks.sequenceRunOrganizationChange,
  withOrganizationChangeSequence: mocks.sequenceWithOrganizationChangeSequence
}));
vi.mock('../cts-types/repository.js', () => ({
  findByTypeId: mocks.findByTypeId,
  listByOrganization: mocks.listByOrganization
}));
vi.mock('../plugins/repository.js', () => ({
  listDeclarationsByOrganization: mocks.listDeclarationsByOrganization,
  findDeclarationByTypeId: mocks.findDeclarationByTypeId
}));
vi.mock('../../core/access/service.js', () => ({ hasInstanceAccess: mocks.hasInstanceAccess }));
vi.mock('../workflow-overrides/service.js', () => ({ resolveActiveWorkflow: mocks.resolveActiveWorkflow }));
vi.mock('../instance-events/service.js', () => ({ publishEntityChanged: mocks.publishEntityChanged }));

import * as graphExecutionsService from './service.js';
import { instanceServiceResolver, invalidateInstanceDeclarations } from '../instances/service.js';

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

// Proof point 1: the org type `part` pins this graph as its validation
// facet — the core data provider reads the reference instance, the
// installed plugin op composes it with the draft projection, and the
// boolean `valid` output gates the instance write.
const VALIDATE_PIN = { pluginId: 'reports', version: '12', runtimeId: 'reports-js', operationId: 'part.validate' };

const partValidateDefinition = () => ({
  provider: 'plugin.reports',
  id: 'part.validate',
  version: '1',
  label: 'Validate a part draft',
  execution: { kind: 'pure', targets: ['browser', 'server'], capabilities: [], deterministic: true, idempotent: true },
  inputs: [
    { id: 'instance', required: true, shape: 'item', semantic: { base: 'json' } },
    { id: 'reference', required: false, shape: 'list', semantic: { base: 'json' } }
  ],
  outputs: [{ id: 'valid', required: true, shape: 'item', semantic: { base: 'boolean' } }],
  packagePin: VALIDATE_PIN
});

const validationGraph = () => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: GRAPH_DOCUMENT_VERSION,
  id: 'graph.part-validation',
  revision: 'rev-01',
  name: 'Part validation',
  interface: {
    inputs: [{ id: 'instance', label: 'Draft', contract: { shape: 'item', semantic: { base: 'json' } } }],
    outputs: [{ id: 'valid', label: 'Valid', contract: { shape: 'item', semantic: { base: 'boolean' } } }]
  },
  nodes: [
    { id: 'input-instance', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'instance' } },
    { id: 'query-reference', operation: { provider: 'perigram.core.data', id: 'query.instances', version: '1' }, config: { typeId: 'part', instanceId: 'item-1' } },
    { id: 'validate-part', operation: { provider: 'plugin.reports', id: 'part.validate', version: '1' }, config: {} },
    { id: 'output-valid', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'valid' } }
  ],
  edges: [
    { id: 'edge-draft', source: { node: 'input-instance', port: 'value' }, target: { node: 'validate-part', port: 'instance' } },
    { id: 'edge-reference', source: { node: 'query-reference', port: 'items' }, target: { node: 'validate-part', port: 'reference' } },
    { id: 'edge-valid', source: { node: 'validate-part', port: 'valid' }, target: { node: 'output-valid', port: 'value' } }
  ]
});

const partDeclaration = () => ({
  id: 'part',
  class: 'item',
  version: 2,
  name: 'Part',
  fields: { code: { base: 'string', identifier: true } },
  graphValidation: { graphId: 'graph.part-validation', revision: 'rev-01', outputId: 'valid' }
});

const validationGraphDocument = {
  _id: 'validation-graph-1',
  organizationId: 'org-1',
  fields: { graphId: 'graph.part-validation' },
  payload: { fileId: 'validation-graph-file-1' }
};

// SPEC §30.13 required convergence proof — coverage:
// 1. org-defined CTS type with graph-backed validation (the `part`
//    graphValidation pin, evaluated inside the generic instance create)
// 2. core + installed plugin operation composition (both graphs)
// 3. semantic resolution and conversion-decision rejection (unit edge)
// 4. typed-IR lowering preflight (every evaluation lowers first)
// 5. effect-free preview with an explicitly authorized Commit
// 6. pinned dependencies, read-set evidence, provenance (execution records)
// 7. deterministic re-runs on the server target (cross-target parity: the
//    browser session runs no server install resolver — precise limitation)
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
  const instanceCollections = new Map();
  const collectionStub = name => {
    if (!instanceCollections.has(name)) {
      instanceCollections.set(name, {
        insertOne: vi.fn(async () => ({ acknowledged: true })),
        findOne: vi.fn(async () => null),
        findOneAndUpdate: vi.fn(async () => null),
        find: vi.fn(() => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) })),
        deleteOne: vi.fn(async () => ({ deletedCount: 0 })),
        updateOne: vi.fn(async () => ({ modifiedCount: 0 }))
      });
    }
    return instanceCollections.get(name);
  };

  const previewSlice = () => graphExecutionsService.evaluateAndRecordSavedGraphPreview({
    graphDocumentInstanceId: 'graph-instance-1',
    inputBindings: { target: { type: 'part', id: 'item-1' } },
    executeManagedNode: managedPluginRuntime()
  }, auth);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listInstalledGraphProviderConversions.mockResolvedValue([]);
    instanceCollections.clear();
    session.withTransaction.mockImplementation(async callback => await callback());
    mocks.connectDB.mockResolvedValue({
      client: { startSession: () => session },
      collection: name => collectionStub(name)
    });
    graphService.processGetById.mockImplementation(async id => (
      id === 'validation-graph-1' ? validationGraphDocument : graphDocument
    ));
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
      if (operation.id === 'part.validate') return partValidateDefinition();
      return null;
    });
    mocks.findByTypeId.mockImplementation(async (organizationId, typeId) => (
      typeId === 'part' ? partDeclaration() : null
    ));
    mocks.listByOrganization.mockImplementation(async organizationId => (
      organizationId === 'org-1' ? [partDeclaration()] : []
    ));
    mocks.listDeclarationsByOrganization.mockResolvedValue([]);
    mocks.findDeclarationByTypeId.mockResolvedValue(null);
    mocks.hasInstanceAccess.mockReturnValue(true);
    mocks.resolveActiveWorkflow.mockResolvedValue(null);
    mocks.publishEntityChanged.mockResolvedValue(null);
    mocks.sequenceGetOrganizationChangeSequence.mockResolvedValue(0);
    mocks.sequenceRecordOrganizationChange.mockResolvedValue(1);
    mocks.sequenceRunOrganizationChange.mockImplementation(async (_organizationId, _metadata, mutate) => await mutate());
    mocks.sequenceWithOrganizationChangeSequence.mockImplementation(async (_organizationId, read) => ({
      value: await read(),
      boundary: { consistency: 'sequence-bracketed', snapshotId: null, organizationSequenceStart: 4, organizationSequenceEnd: 4 }
    }));
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
    mocks.getFileBuffer.mockImplementation(async fileId => (
      fileId === 'validation-graph-file-1'
        ? Buffer.from(JSON.stringify(validationGraph()))
        : Buffer.from(JSON.stringify(convergenceGraph()))
    ));
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

  // Proof point 1: the organization type `part` pins a saved graph as its
  // validation facet; the generic instance create resolves the pin under
  // the acting principal, evaluates core + plugin composition, and writes
  // only when the declared boolean output is true.
  it('enforces an org-defined CTS type graphValidation pin during the generic instance create', async () => {
    graphService.processList.mockImplementation(async filters => (
      String(filters?.graphId) === 'graph.part-validation' ? [validationGraphDocument] : []
    ));
    const items = collectionStub('items');
    const actingPrincipal = { userId: 'user-1', organizationId: 'org-1' };
    const validationEvidence = [];
    mocks.executeManagedGraphNode.mockReset();
    mocks.executeManagedGraphNode.mockImplementation(async (definition, invocation) => {
      validationEvidence.push({
        packagePin: definition.packagePin,
        executionId: invocation.context.executionId,
        readSet: invocation.context.readSet.toJSON(),
        inputs: invocation.inputs
      });
      return {
        valid: Boolean(invocation.inputs.reference?.length)
          && invocation.inputs.instance.fields.code !== 'B'
      };
    });

    const created = await instanceServiceResolver('part').create(
      { name: 'Checked part', fields: { code: 'C' } },
      'user-1',
      'org-1'
    );

    expect(items.insertOne).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({
      type: 'part',
      typeVersion: 2,
      revision: 1,
      organizationId: 'org-1',
      name: 'Checked part',
      fields: { code: 'C' }
    });
    expect(dataService.processGetById).toHaveBeenCalledWith('item-1', actingPrincipal, { session: undefined });
    expect(mocks.resolveInstalledGraphNodeDefinition).toHaveBeenCalledWith({
      provider: 'plugin.reports',
      id: 'part.validate',
      version: '1',
      auth: actingPrincipal
    });
    expect(validationEvidence).toEqual([{
      packagePin: VALIDATE_PIN,
      executionId: expect.any(String),
      inputs: {
        instance: { fields: { code: 'C' } },
        reference: [partInstance('item-1')]
      },
      readSet: expect.objectContaining({
        consistency: 'snapshot',
        snapshotId: 'snapshot-42',
        organizationSequenceStart: 4,
        organizationSequenceEnd: 4,
        instances: [expect.objectContaining({ typeId: 'part', instanceId: 'item-1', revision: '3' })],
        queries: [expect.objectContaining({ typeId: 'part', resultIds: ['item-1'], observedTotal: 1 })]
      })
    }]);

    const rejection = await instanceServiceResolver('part').create(
      { name: 'Bad part', fields: { code: 'B' } },
      'user-1',
      'org-1'
    ).catch(error => error);
    expect(rejection).toMatchObject({ statusCode: 400 });
    expect(rejection.data.errors).toEqual(['graph validation output valid did not evaluate to true']);
    expect(items.insertOne).toHaveBeenCalledTimes(1);
  });

  it('fences the instance write on the graph validation organization sequence', async () => {
    graphService.processList.mockImplementation(async filters => (
      String(filters?.graphId) === 'graph.part-validation' ? [validationGraphDocument] : []
    ));
    const items = collectionStub('items');
    mocks.executeManagedGraphNode.mockReset();
    mocks.executeManagedGraphNode.mockResolvedValue({ valid: true });
    mocks.sequenceGetOrganizationChangeSequence.mockResolvedValue(3);
    mocks.sequenceRunOrganizationChange.mockImplementation(async (_organizationId, _metadata, mutate, options = {}) => {
      if (options.expectedSequence !== 4) {
        const error = new Error('Organization data changed after graph preview');
        error.statusCode = 409;
        error.code = 'STALE_ORGANIZATION_READ';
        throw error;
      }
      return await mutate();
    });

    await instanceServiceResolver('part').create(
      { name: 'Fenced part', fields: { code: 'C' } },
      'user-1',
      'org-1'
    );
    expect(items.insertOne).toHaveBeenCalledTimes(1);

    mocks.sequenceRunOrganizationChange.mockImplementation(async () => {
      const error = new Error('Organization data changed during validation');
      error.statusCode = 409;
      error.code = 'STALE_ORGANIZATION_READ';
      throw error;
    });
    const conflict = await instanceServiceResolver('part').create(
      { name: 'Stale part', fields: { code: 'C' } },
      'user-1',
      'org-1'
    ).catch(error => error);
    expect(conflict).toMatchObject({ statusCode: 409, code: 'STALE_ORGANIZATION_READ' });
    expect(items.insertOne).toHaveBeenCalledTimes(1);
  });

  it('validates a field patch against the merged candidate before the write', async () => {
    graphService.processList.mockImplementation(async filters => (
      String(filters?.graphId) === 'graph.part-validation' ? [validationGraphDocument] : []
    ));
    const items = collectionStub('items');
    const current = { ...partInstance('item-1'), name: 'Part', updatedAt: '2026-11-16T10:00:00Z' };
    items.findOne.mockResolvedValue(current);
    items.findOneAndUpdate.mockImplementation(async (filter, update) => ({
      ...current,
      fields: { ...current.fields, code: update.$set['fields.code'] },
      revision: current.revision + 1
    }));
    const draftBindings = [];
    mocks.executeManagedGraphNode.mockReset();
    mocks.executeManagedGraphNode.mockImplementation(async (_definition, invocation) => {
      draftBindings.push(invocation.inputs.instance);
      return { valid: invocation.inputs.instance.fields.code !== 'B' };
    });

    const updated = await instanceServiceResolver('part').processUpdate('item-1', { fields: { code: 'C' } }, {
      organizationId: 'org-1',
      userId: 'user-1',
      auth
    });

    expect(draftBindings).toEqual([{ fields: { code: 'C' } }]);
    expect(items.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(updated).toMatchObject({ _id: 'item-1', revision: 4, fields: { code: 'C' } });

    const refused = await instanceServiceResolver('part').processUpdate('item-1', { fields: { code: 'B' } }, {
      organizationId: 'org-1',
      userId: 'user-1',
      auth
    }).catch(error => error);
    expect(refused).toMatchObject({ statusCode: 400 });
    expect(refused.data.errors).toEqual(['graph validation output valid did not evaluate to true']);
    expect(items.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a graphValidation pin cannot resolve or bind its inputs', async () => {
    const items = collectionStub('items');

    // Unreadable pinned graph: no graph document matches the pin.
    graphService.processList.mockResolvedValue([]);
    const unavailable = await instanceServiceResolver('part').create(
      { name: 'Part', fields: { code: 'C' } },
      'user-1',
      'org-1'
    ).catch(error => error);
    expect(unavailable).toMatchObject({ statusCode: 400 });
    expect(unavailable.data.errors[0]).toContain('graph graph.part-validation@rev-01 is unavailable');
    expect(items.insertOne).not.toHaveBeenCalled();

    graphService.processList.mockImplementation(async filters => (
      String(filters?.graphId) === 'graph.part-validation' ? [validationGraphDocument] : []
    ));

    // A required graph input port with no binding convention refuses the
    // write naming the port.
    const withExtraPort = validationGraph();
    withExtraPort.interface.inputs.push({ id: 'undeclared-port', label: 'Extra', contract: { shape: 'item', semantic: { base: 'json' } } });
    withExtraPort.nodes.push({ id: 'input-extra', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'undeclared-port' } });
    mocks.getFileBuffer.mockImplementation(async fileId => (
      fileId === 'validation-graph-file-1'
        ? Buffer.from(JSON.stringify(withExtraPort))
        : Buffer.from(JSON.stringify(convergenceGraph()))
    ));
    const refused = await instanceServiceResolver('part').create(
      { name: 'Part', fields: { code: 'C' } },
      'user-1',
      'org-1'
    ).catch(error => error);
    expect(refused).toMatchObject({ statusCode: 400 });
    expect(refused.data.errors).toEqual(['graph input undeclared-port is required and unbound for type part']);
    expect(items.insertOne).not.toHaveBeenCalled();
    expect(mocks.executeManagedGraphNode).not.toHaveBeenCalled();

    // A pinned output the graph does not declare refuses the write.
    mocks.getFileBuffer.mockImplementation(async fileId => (
      fileId === 'validation-graph-file-1'
        ? Buffer.from(JSON.stringify(validationGraph()))
        : Buffer.from(JSON.stringify(convergenceGraph()))
    ));
    invalidateInstanceDeclarations('org-1');
    mocks.findByTypeId.mockImplementation(async (organizationId, typeId) => (
      typeId === 'part'
        ? { ...partDeclaration(), graphValidation: { graphId: 'graph.part-validation', revision: 'rev-01', outputId: 'missing' } }
        : null
    ));
    const noOutput = await instanceServiceResolver('part').create(
      { name: 'Part', fields: { code: 'C' } },
      'user-1',
      'org-1'
    ).catch(error => error);
    expect(noOutput).toMatchObject({ statusCode: 400 });
    expect(noOutput.data.errors).toEqual(['graph graph.part-validation@rev-01 declares no output missing']);
    expect(items.insertOne).not.toHaveBeenCalled();

    // A non-boolean verdict is caught by the evaluator's typed output check
    // and maps to the same fail-closed 400 as a thrown evaluation error.
    invalidateInstanceDeclarations('org-1');
    mocks.findByTypeId.mockImplementation(async (organizationId, typeId) => (
      typeId === 'part' ? partDeclaration() : null
    ));
    const verdicts = ['yes', null, 1];
    for (const verdict of verdicts) {
      mocks.executeManagedGraphNode.mockReset();
      mocks.executeManagedGraphNode.mockResolvedValue({ valid: verdict });
      const nonBoolean = await instanceServiceResolver('part').create(
        { name: 'Part', fields: { code: 'C' } },
        'user-1',
        'org-1'
      ).catch(error => error);
      expect(nonBoolean).toMatchObject({ statusCode: 400 });
      expect(nonBoolean.data.errors[0]).toContain('graph graph.part-validation@rev-01 failed to evaluate');
      expect(items.insertOne).not.toHaveBeenCalled();
    }
    mocks.executeManagedGraphNode.mockReset();
    mocks.executeManagedGraphNode.mockRejectedValue(new Error('plugin worker exploded'));
    const evaluationFailure = await instanceServiceResolver('part').create(
      { name: 'Part', fields: { code: 'C' } },
      'user-1',
      'org-1'
    ).catch(error => error);
    expect(evaluationFailure).toMatchObject({ statusCode: 400 });
    expect(evaluationFailure.data.errors[0]).toContain('failed to evaluate');
    expect(items.insertOne).not.toHaveBeenCalled();
  });
});
