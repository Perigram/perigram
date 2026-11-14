import { describe, expect, it, vi, beforeEach } from 'vitest';

const { repository } = vi.hoisted(() => ({
  repository: {
    findById: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn()
  }
}));

vi.mock('./repository.js', () => repository);
vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
vi.mock('~/server/features/process-definitions/service.js', () => ({}));
vi.mock('~/server/features/invitations/service.js', () => ({}));
vi.mock('~/server/core/machines/service.js', () => ({ stateService: {} }));
vi.mock('h3', () => ({
  createError: vi.fn(error => Object.assign(new Error(error.message), { statusCode: error.statusCode }))
}));

import { remove, update } from './service.js';

const auth = {
  userId: 'member',
  organizationId: 'org-a',
  permissions: { organizations: 'admin' }
};

beforeEach(() => vi.clearAllMocks());

describe('organization mutation tenant scope', () => {
  it('rejects updating another organization before reading or writing it', async () => {
    await expect(update('org-b', { name: 'Hijacked' }, auth))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.updateById).not.toHaveBeenCalled();
  });

  it('rejects deleting another organization before reading or deleting it', async () => {
    await expect(remove('org-b', auth))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.deleteById).not.toHaveBeenCalled();
  });
});
