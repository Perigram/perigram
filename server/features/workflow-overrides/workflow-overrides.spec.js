import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./repository.js', () => ({
  archiveActive: vi.fn(),
  create: vi.fn(),
  findActiveByEntity: vi.fn(),
  findLatestByEntity: vi.fn()
}));

vi.mock('~/server/runtime/cutkit-registry.js', () => ({
  getCutkitRegistry: () => ({
    getDomain: () => ({
      workflows: {
        project: {
          initial: 'DRAFT',
          states: { DRAFT: {}, ACTIVE: {} },
          transitions: [{ from: 'DRAFT', to: 'ACTIVE' }]
        }
      }
    }),
    getEntityDefinition: (type) => (type === 'project' ? { type: 'project', collection: 'projects' } : null)
  })
}));

vi.mock('~/server/core/access/service.js', () => ({
  assertEntityAccess: vi.fn(() => true)
}));

import * as repository from './repository.js';
import * as service from './service.js';

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
      entityType: 'project',
      updatedBy: 'user-1'
    });
    expect(result.entityType).toBe('project');
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
      entityType: 'project',
      organizationId: auth.memberships[0].organizationId
    });

    expect(workflow.initial).toBe('CUSTOM');
  });

  it('falls back to the default workflow when no active override exists', async () => {
    repository.findActiveByEntity.mockResolvedValue(null);

    const workflow = await service.resolveActiveWorkflow({
      entityType: 'project',
      organizationId: auth.memberships[0].organizationId
    });

    expect(workflow.initial).toBe('DRAFT');
  });
});
