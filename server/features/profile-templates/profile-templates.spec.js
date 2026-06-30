import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';

const mocks = vi.hoisted(() => ({
  repository: {
    findById: vi.fn(),
    findSystem: vi.fn(),
    findByScope: vi.fn(),
    create: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn()
  },
  permissions: {
    hasLineagePermission: vi.fn()
  },
  cassetteService: {
    getById: vi.fn()
  }
}));

vi.mock('./repository.js', () => mocks.repository);
vi.mock('../../utils/permissions.js', () => mocks.permissions);
vi.mock('../cassettes/service.js', () => mocks.cassetteService);
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import { serializeForAccess } from '../../utils/entity-redaction.js';
import * as service from './service.js';

const auth = {
  userId: 'user-profile',
  memberships: [
    {
      organizationId: 'org-cassette',
      permissions: {
        cassettes: 'write'
      }
    }
  ]
};
const createdId = new ObjectId('665000000000000000000001');

const sketch = {
  version: '0.1',
  units: 'mm',
  closed: true,
  parameters: {},
  points: [
    { id: 'p0', x: 0, y: 0 },
    { id: 'p1', x: 10, y: 0 },
    { id: 'p2', x: 10, y: 10 }
  ],
  edges: [
    { id: 'e0', type: 'line', from: 'p0', to: 'p1' },
    { id: 'e1', type: 'line', from: 'p1', to: 'p2' },
    { id: 'e2', type: 'line', from: 'p2', to: 'p0' }
  ],
  holes: [],
  modifiers: []
};

describe('profile templates service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions.hasLineagePermission.mockReturnValue(true);
    mocks.repository.findSystem.mockResolvedValue([]);
    mocks.repository.findByScope.mockResolvedValue([]);
    mocks.repository.create.mockImplementation(async (record) => ({ ...record, _id: createdId }));
    mocks.repository.updateById.mockResolvedValue(true);
    mocks.repository.deleteById.mockResolvedValue(true);
    mocks.cassetteService.getById.mockResolvedValue({
      _id: 'cassette-1',
      identity: { name: 'Cassette' },
      lineage: { organizationId: 'org-cassette' },
      data: {}
    });
  });

  it('creates profile templates under cassette-accessible organization lineage from memberships', async () => {
    const created = await service.create({ name: 'Hook profile', sketch }, auth);

    expect(mocks.permissions.hasLineagePermission).toHaveBeenCalledWith(
      auth,
      { lineage: { organizationId: 'org-cassette' } },
      'cassettes',
      'write'
    );
    expect(mocks.repository.create).toHaveBeenCalledWith(expect.objectContaining({
      lineage: {
        userId: 'user-profile',
        organizationId: 'org-cassette'
      }
    }));
    expect(created._id.toString()).toBe(createdId.toString());
  });

  it('returns saved profile fields after cassette-rights redaction', async () => {
    const created = await service.create({ name: 'Visible profile', sketch }, auth);
    const redacted = serializeForAccess('profileTemplate', created, auth);

    expect(redacted._id.toString()).toBe(createdId.toString());
    expect(redacted.identity.name).toBe('Visible profile');
    expect(redacted.data.sketch.points).toHaveLength(3);
  });

  it('creates profile templates through entity-scoped cassette access', async () => {
    mocks.permissions.hasLineagePermission.mockImplementation((_, entity) => entity?._id === 'cassette-1');

    const created = await service.create({
      name: 'Entity scoped profile',
      cassetteTemplateId: 'cassette-1',
      sketch
    }, auth);

    expect(mocks.cassetteService.getById).toHaveBeenCalledWith('cassette-1');
    expect(created._id.toString()).toBe(createdId.toString());
    expect(mocks.repository.create).toHaveBeenCalledWith(expect.objectContaining({
      lineage: {
        userId: 'user-profile',
        organizationId: 'org-cassette'
      }
    }));
  });

  it('lists only scoped profiles readable through cassette permissions', async () => {
    const readable = {
      _id: 'profile-readable',
      identity: { name: 'Readable' },
      lineage: { organizationId: 'org-cassette' },
      data: {}
    };
    const blocked = {
      _id: 'profile-blocked',
      identity: { name: 'Blocked' },
      lineage: { organizationId: 'org-other' },
      data: {}
    };
    mocks.repository.findByScope.mockResolvedValue([readable, blocked]);
    mocks.permissions.hasLineagePermission.mockImplementation((_, entity) => entity.lineage.organizationId === 'org-cassette');

    const profiles = await service.listAll(auth);

    expect(profiles.map(profile => profile._id)).toEqual(['profile-readable']);
    expect(mocks.repository.findByScope).toHaveBeenCalledWith({
      userId: 'user-profile',
      organizationId: 'org-cassette'
    });
  });

  it('normalizes legacy user-scoped profiles for cassette-rights redaction', async () => {
    const legacyId = new ObjectId('665000000000000000000002');
    mocks.repository.findByScope.mockResolvedValue([{
      _id: legacyId,
      identity: { name: 'Legacy user profile' },
      lineage: { userId: 'user-profile' },
      data: { sketch }
    }]);

    const [profile] = await service.listAll(auth);
    const redacted = serializeForAccess('profileTemplate', profile, auth);

    expect(redacted._id.toString()).toBe(legacyId.toString());
    expect(redacted.identity.name).toBe('Legacy user profile');
    expect(redacted.lineage.organizationId).toBe('org-cassette');
  });

  it('updates editable templates through cassette write permission', async () => {
    mocks.repository.findById
      .mockResolvedValueOnce({
        _id: 'profile-editable',
        identity: { name: 'Old' },
        lineage: { organizationId: 'org-cassette' },
        data: { sketch }
      })
      .mockResolvedValueOnce({
        _id: 'profile-editable',
        identity: { name: 'New' },
        lineage: { organizationId: 'org-cassette' },
        data: { sketch }
      });

    await service.update('profile-editable', { name: 'New', sketch }, auth);

    expect(mocks.permissions.hasLineagePermission).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ lineage: { organizationId: 'org-cassette' } }),
      'cassettes',
      'write'
    );
    expect(mocks.repository.updateById).toHaveBeenCalledWith('profile-editable', expect.objectContaining({
      identity: expect.objectContaining({ name: 'New' })
    }));
  });
});
