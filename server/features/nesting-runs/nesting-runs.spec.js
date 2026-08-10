import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    find: vi.fn(),
    findById: vi.fn(),
    updateById: vi.fn()
  },
  permissions: {
    getLineageFilter: vi.fn(() => ({ 'lineage.organizationId': 'org-1' })),
    hasLineagePermission: vi.fn(() => true)
  }
}));

vi.mock('./repository.js', () => mocks.repository);
vi.mock('../../utils/permissions.js', () => mocks.permissions);
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as service from './service.js';

describe('nesting-runs service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions.getLineageFilter.mockReturnValue({ 'lineage.organizationId': 'org-1' });
    mocks.permissions.hasLineagePermission.mockReturnValue(true);
    mocks.repository.find.mockResolvedValue([]);
  });

  it('maps primary status filters onto the status block in list queries', async () => {
    await service.list('user-a', 'org-1', undefined, { memberships: [] }, {
      queueId: 'queue-1',
      projectId: 'project-1',
      primaryStatus: 'CUT'
    });

    expect(mocks.repository.find).toHaveBeenCalledWith({
      'lineage.organizationId': 'org-1',
      'lineage.queueId': 'queue-1',
      'lineage.projectId': 'project-1',
      'status.state.primary': 'CUT'
    });
  });

  it('supports comma-separated primary status windows in list queries', async () => {
    await service.list('user-a', 'org-1', undefined, { memberships: [] }, {
      primaryStatuses: 'CUT, SHIPPED'
    });

    expect(mocks.repository.find).toHaveBeenCalledWith({
      'lineage.organizationId': 'org-1',
      'status.state.primary': { $in: ['CUT', 'SHIPPED'] }
    });
  });
});
