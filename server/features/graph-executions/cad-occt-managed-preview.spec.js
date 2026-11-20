import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION
} from '#packages/core';

// Managed-runtime execution of the cad-occt geometry kernel (TESTING
// layer 3, the documents-preview-bake pattern): the real evaluator and
// the real managed dispatch run together over a mocked task queue whose
// enqueued cad-occt tasks execute the real runtime module — the same
// execute(operationId, input) call the isolated plugin-runtime child
// makes. Only the task queue, storage seams, and the pages write are
// mocked. The chain primitive → boolean → tessellate is the SPEC §20
// vertical-slice shape for cad.occt.

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
import { createRuntime as createCadOcctRuntime } from '../../../workers/cad-occt/runtime/cad-occt.mjs';
import cadOcctListing from '../../../workers/cad-occt/listing.json';

const auth = { userId: 'user-1', organizationId: 'org-1' };

// The installed-package snapshot mirrors the pinned listing: provider
// definitions and package pins resolve exactly as a real install would.
const cadOcctInstall = () => ({
  pluginId: 'cad-occt',
  version: cadOcctListing.version,
  services: cadOcctListing.declarations.services,
  declarations: { runtimes: cadOcctListing.declarations.runtimes }
});

const MESH_CONTRACT = { shape: 'item', semantic: { base: 'json', representation: 'perigram.scene-3d' } };

const drilledPlateGraph = () => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: GRAPH_DOCUMENT_VERSION,
  id: 'graph.cad-occt-drilled-plate',
  revision: 'rev-01',
  name: 'Drilled plate',
  interface: {
    inputs: [],
    outputs: [{ id: 'mesh', label: 'Drilled plate mesh', contract: MESH_CONTRACT }]
  },
  nodes: [
    { id: 'plate', operation: { provider: 'plugin.cad-occt', id: 'make-box', version: '1' }, config: { width: 30, depth: 20, height: 10 } },
    { id: 'hole', operation: { provider: 'plugin.cad-occt', id: 'make-cylinder', version: '1' }, config: { radius: 4, height: 15, at: { x: 15, y: 10, z: -2 } } },
    { id: 'drill', operation: { provider: 'plugin.cad-occt', id: 'cut-shapes', version: '1' }, config: {} },
    { id: 'mesh', operation: { provider: 'plugin.cad-occt', id: 'tessellate-shape', version: '1' }, config: {} },
    { id: 'output-mesh', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'mesh' } }
  ],
  edges: [
    { id: 'edge-plate', source: { node: 'plate', port: 'value' }, target: { node: 'drill', port: 'base' } },
    { id: 'edge-hole', source: { node: 'hole', port: 'value' }, target: { node: 'drill', port: 'tool' } },
    { id: 'edge-drilled', source: { node: 'drill', port: 'value' }, target: { node: 'mesh', port: 'shape' } },
    { id: 'edge-mesh', source: { node: 'mesh', port: 'value' }, target: { node: 'output-mesh', port: 'value' } }
  ]
});

describe('cad-occt managed graph preview (primitive → boolean → tessellate)', () => {
  const graphService = { processGetById: vi.fn(), processList: vi.fn() };
  const executionService = { create: vi.fn(async () => ({ _id: 'execution-instance-1' })) };
  const graphDocument = {
    _id: 'graph-instance-1',
    organizationId: 'org-1',
    fields: { graphId: 'graph.cad-occt-drilled-plate' },
    payload: { fileId: 'graph-file-1' }
  };
  const taskRuns = new Map();

  beforeEach(() => {
    vi.clearAllMocks();
    taskRuns.clear();
    mocks.findInstall.mockResolvedValue(cadOcctInstall());
    mocks.getTaskRunById.mockImplementation(async id => taskRuns.get(String(id)) || null);
    mocks.enqueueTask.mockImplementation(async (taskId, input, runAuth, options) => {
      const pin = input?.parameters?.value || {};
      if (pin.pluginId !== 'cad-occt') throw new Error(`Unexpected plugin task: ${taskId}`);
      // The isolated plugin-runtime child calls
      // execute(operationId, input, { capabilities, signal }) — a fresh
      // runtime instance per task mirrors the fresh process per operation.
      const runtime = createCadOcctRuntime();
      const output = await runtime.execute(pin.operationId, pin.input, {
        capabilities: { call: async name => { throw new Error(`unexpected capability call: ${name}`); } },
        signal: new AbortController().signal
      });
      const run = {
        _id: `run-${taskId}-${taskRuns.size}`,
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
    graphService.processGetById.mockResolvedValue(graphDocument);
    mocks.getFileBuffer.mockImplementation(fileId => (
      fileId === 'graph-file-1'
        ? Buffer.from(JSON.stringify(drilledPlateGraph()))
        : Buffer.from('')
    ));
    mocks.withOrganizationDataSnapshot.mockImplementation(async (_organizationId, read) => ({
      value: await read(),
      boundary: { consistency: 'snapshot', snapshotId: 'snap-9', organizationSequenceStart: 9, organizationSequenceEnd: 9 }
    }));
    mocks.withOrganizationChangeSequence.mockImplementation(async (_organizationId, read) => ({
      value: await read(),
      boundary: { consistency: 'sequence-bracketed', snapshotId: null, organizationSequenceStart: 9, organizationSequenceEnd: 9 }
    }));
    mocks.runOrganizationChange.mockImplementation(async (_organizationId, _metadata, mutate) => await mutate());
    mocks.connectDB.mockResolvedValue({
      client: { startSession: () => ({ withTransaction: async callback => await callback(), endSession: async () => {} }) },
      collection: () => ({})
    });
    mocks.findFileMeta.mockResolvedValue({ metadata: { organizationId: 'org-1' }, contentType: 'application/json' });
    mocks.assertFileReadAccess.mockReturnValue(true);
    mocks.contentHash.mockImplementation(buffer => `sha256:${buffer.length}`);
  });

  it('evaluates the chain through the real dispatch harness and answers the mesh channel value', async () => {
    const { execution } = await graphExecutionsService.evaluateAndRecordSavedGraphPreview({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings: {}
    }, auth);

    expect(execution).toMatchObject({ profile: 'procedural-preview', status: 'succeeded' });
    const mesh = execution.outputs.mesh?.value ?? execution.outputs.mesh;
    expect(mesh.representation).toBe('perigram.scene-3d');
    expect(mesh.faces.length).toBeGreaterThan(100);
    expect(mesh.normals).toHaveLength(mesh.vertices.length);

    // Every cad-occt node ran as its own managed task, exactly as the
    // plugin-runtime child would claim them; the two independent
    // primitives schedule in either order, the boolean and the
    // tessellation follow.
    const taskIds = mocks.enqueueTask.mock.calls.map(call => call[0]);
    expect(taskIds.slice(0, 2).sort()).toEqual(['plugin.cad-occt.make-box', 'plugin.cad-occt.make-cylinder']);
    expect(taskIds.slice(2)).toEqual(['plugin.cad-occt.cut-shapes', 'plugin.cad-occt.tessellate-shape']);
  }, 120_000);
});
