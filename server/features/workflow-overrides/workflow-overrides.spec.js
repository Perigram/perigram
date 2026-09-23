import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./repository.js', () => ({
  archiveActive: vi.fn(),
  create: vi.fn(),
  findActiveByEntity: vi.fn(),
  findLatestByEntity: vi.fn()
}));

vi.mock('~/server/runtime/perigram-registry.js', () => ({
  getPerigramRegistry: () => ({
    getDomain: () => ({
      workflows: {
        project: {
          initial: 'DRAFT',
          states: { DRAFT: {}, ACTIVE: {} },
          transitions: [{ from: 'DRAFT', to: 'ACTIVE' }]
        },
        artifact: {
          initial: 'PENDING',
          states: { PENDING: {}, AVAILABLE: {} },
          transitions: [{
            from: 'PENDING',
            to: 'AVAILABLE',
            intent: 'artifactFileStored',
            display: 'hidden',
            access: { system: true }
          }]
        }
      }
    }),
    getInstanceDefinition: (type) => (['project', 'artifact'].includes(type) ? { type, collection: `${type}s` } : null)
  })
}));

vi.mock('~/server/core/access/service.js', () => ({
  assertEntityAccess: vi.fn(() => true)
}));

vi.mock('~/server/features/process-definitions/runtime.js', () => ({
  resolveProcessWorkflow: vi.fn(async () => null)
}));

import * as repository from './repository.js';
import * as service from './service.js';
import { resolveProcessWorkflow } from '~/server/features/process-definitions/runtime.js';

const auth = {
  userId: 'user-1',
  memberships: [{
    organizationId: '665000000000000000000001',
    permissions: { projects: 'admin' }
  }]
};

describe('workflow overrides service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('activates a normalized organization-owned workflow override', async () => {
    repository.create.mockImplementation(async doc => ({ _id: 'override-1', ...doc }));

    const result = await service.activate('project', {
      workflow: {
        initial: 'DRAFT',
        states: { DRAFT: {}, REVIEW: {} },
        transitions: [{ from: 'DRAFT', to: 'REVIEW' }]
      }
    }, auth);

    expect(repository.archiveActive).toHaveBeenCalledWith({
      organizationId: auth.memberships[0].organizationId,
      typeId: 'project',
      updatedBy: 'user-1'
    });
    expect(result.typeId).toBe('project');
    expect(result.status).toBe('ACTIVE');
    expect(result.workflow.schemaVersion).toBe(2);
    expect(result.workflow.primaryRegion).toBe('main');
  });

  it('resolves active override before default workflow', async () => {
    repository.findActiveByEntity.mockResolvedValue({
      workflow: {
        initial: 'CUSTOM',
        states: { CUSTOM: {}, DONE: {} },
        transitions: [{ from: 'CUSTOM', to: 'DONE' }]
      }
    });

    const workflow = await service.resolveActiveWorkflow({
      typeId: 'project',
      organizationId: auth.memberships[0].organizationId
    });

    expect(workflow.initial).toBe('CUSTOM');
  });

  it('falls back to the default workflow when no active override exists', async () => {
    repository.findActiveByEntity.mockResolvedValue(null);

    const workflow = await service.resolveActiveWorkflow({
      typeId: 'project',
      organizationId: auth.memberships[0].organizationId
    });

    expect(workflow.initial).toBe('DRAFT');
    expect(resolveProcessWorkflow).not.toHaveBeenCalled();
  });

  it('resolves a process workflow only with explicit producer output context', async () => {
    resolveProcessWorkflow.mockResolvedValueOnce({
      initial: 'PROCESS',
      states: { PROCESS: {} },
      transitions: []
    });

    const workflow = await service.resolveActiveWorkflow({
      typeId: 'project',
      organizationId: auth.memberships[0].organizationId,
      producerOutputId: 'create_project:result'
    });

    expect(resolveProcessWorkflow).toHaveBeenCalledWith({
      organizationId: auth.memberships[0].organizationId,
      producerOutputId: 'create_project:result',
      typeId: 'project',
      fallbackWorkflow: null
    });
    expect(workflow.initial).toBe('PROCESS');
  });

  it('keeps process states while making hidden system intents executable', async () => {
    resolveProcessWorkflow.mockResolvedValueOnce({
      initial: 'NEW',
      states: { NEW: {} },
      transitions: []
    });
    repository.findActiveByEntity.mockResolvedValue(null);
    const workflow = await service.resolveActiveWorkflow({
      typeId: 'artifact',
      organizationId: auth.memberships[0].organizationId,
      producerOutputId: 'generate_artifact:result'
    });

    expect(workflow.initial).toBe('NEW');
    expect(workflow.transitions).toContainEqual(expect.objectContaining({
      from: 'NEW',
      to: 'NEW',
      intent: 'artifactFileStored',
      access: { system: true }
    }));
  });
});
