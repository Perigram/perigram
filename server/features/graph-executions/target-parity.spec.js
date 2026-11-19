import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import {
  PARITY_DOUBLE_OPERATION,
  PARITY_EXPECTED_OUTPUTS,
  PARITY_INPUT_BINDINGS,
  parityDoubleDefinition,
  parityDoubleExecutor,
  parityGraphDocument
} from '../../../test-data/graph-target-parity.js';

// SPEC §30.13 convergence proof point 7 — server target. Server evaluation
// resolves installed packages and historical pinned revisions; parity is
// asserted over canonical documents whose operations declare both targets
// (see the fixture's documented limitation).

describe('graph execution target parity (server)', () => {
  const auth = { userId: 'user-1', organizationId: 'org-1' };
  const graphService = { processGetById: vi.fn(), processList: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    graphService.processGetById.mockResolvedValue({
      _id: 'graph-instance-1',
      organizationId: 'org-1',
      fields: { graphId: parityGraphDocument().id },
      payload: { fileId: 'graph-file-1' }
    });
    graphService.processList.mockResolvedValue([]);
    mocks.getAppRegistry.mockReturnValue({
      getInstanceService: () => graphService
    });
    mocks.resolveInstalledGraphNodeDefinition.mockImplementation(async operation => (
      operation.id === PARITY_DOUBLE_OPERATION ? parityDoubleDefinition() : null
    ));
    mocks.findFileMeta.mockResolvedValue({ metadata: { organizationId: 'org-1' }, contentType: 'application/json' });
    mocks.assertFileReadAccess.mockReturnValue(true);
    mocks.getFileBuffer.mockImplementation(async () => Buffer.from(JSON.stringify(parityGraphDocument())));
  });

  it('evaluates the shared parity fixture to the shared expected outputs', async () => {
    const result = await graphExecutionsService.evaluateSavedGraph({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings: PARITY_INPUT_BINDINGS,
      executeManagedNode: parityDoubleExecutor
    }, auth);

    expect(result.outputs).toEqual(PARITY_EXPECTED_OUTPUTS);
    expect(result.nodeOutputs['double']).toEqual(PARITY_EXPECTED_OUTPUTS);
    expect(result.nodeInvocations).toEqual([expect.objectContaining({
      nodeId: 'double',
      status: 'succeeded',
      packagePin: parityDoubleDefinition().packagePin
    })]);
  });
});
