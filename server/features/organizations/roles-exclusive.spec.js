import { describe, it, expect, beforeEach, vi } from 'vitest';

// Single-seat roles at the service seam: flag storage on creation, rename
// preserving the flag, turn-on refused while multiple members hold the
// role (holders in the error data), turn-on allowed with at most one
// holder, and turn-off.

const { mockedRepository, mockedProcessDefinitions, mockedInvitations } = vi.hoisted(() => ({
    mockedRepository: {
        findById: vi.fn(),
        updateById: vi.fn(),
        setRoleAssignment: vi.fn()
    },
    mockedProcessDefinitions: { findRoleReferences: vi.fn(async () => []) },
    mockedInvitations: { findRoleReferences: vi.fn(async () => []) }
}));

vi.mock('./repository.js', () => mockedRepository);
vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
vi.mock('./default-plugins.js', () => ({ installDefaultPlugins: vi.fn() }));
vi.mock('~/server/features/process-definitions/service.js', () => mockedProcessDefinitions);
vi.mock('~/server/features/invitations/service.js', () => mockedInvitations);
vi.mock('~/server/core/machines/service.js', () => ({ stateService: {} }));
vi.mock('h3', () => ({
    createError: vi.fn((err) => {
        const error = new Error(err.message);
        error.statusCode = err.statusCode;
        error.data = err.data;
        return error;
    })
}));

import { createRole, updateRole } from './service.js';

const AUTH = { userId: 'owner', organizationId: 'org-1', permissions: { organizations: 'admin' } };

const orgWith = (roles = {}, roleAssignments = {}) => ({
    identity: { uid: 'org-1', name: 'Org' },
    data: {
        roles,
        roleAssignments,
        settings: {}
    }
});

beforeEach(() => {
    vi.clearAllMocks();
    mockedRepository.updateById.mockResolvedValue({});
});

describe('single-seat role service', () => {
    it('stores the exclusive flag on creation', async () => {
        mockedRepository.findById.mockResolvedValue(orgWith());
        const role = await createRole('org-1', { label: 'Processor', exclusive: true }, AUTH);
        expect(role.exclusive).toBe(true);
        const [, saved] = mockedRepository.updateById.mock.calls[0];
        expect(Object.values(saved.data.roles)[0].exclusive).toBe(true);
    });

    it('keeps the flag through label-only renames', async () => {
        mockedRepository.findById.mockResolvedValue(orgWith({ role_1: { id: 'role_1', label: 'Old', exclusive: true } }));
        const role = await updateRole('org-1', 'role_1', { label: 'New' }, AUTH);
        expect(role).toEqual({ id: 'role_1', label: 'New', exclusive: true });
    });

    it('refuses turning exclusivity on while multiple members hold the role', async () => {
        mockedRepository.findById.mockResolvedValue(orgWith(
            { role_1: { id: 'role_1', label: 'Shared' } },
            {
                'u1': { userId: 'u1', roleIds: ['role_1'] },
                'u2': { userId: 'u2', roleIds: ['role_1', 'role_2'] }
            }
        ));
        await expect(updateRole('org-1', 'role_1', { label: 'Shared', exclusive: true }, AUTH))
            .rejects.toMatchObject({ statusCode: 409, data: { holders: ['u1', 'u2'] } });
        expect(mockedRepository.updateById).not.toHaveBeenCalled();
    });

    it('allows turning exclusivity on with at most one holder', async () => {
        mockedRepository.findById.mockResolvedValue(orgWith(
            { role_1: { id: 'role_1', label: 'Seat' } },
            { 'u1': { userId: 'u1', roleIds: ['role_1'] } }
        ));
        const role = await updateRole('org-1', 'role_1', { label: 'Seat', exclusive: true }, AUTH);
        expect(role.exclusive).toBe(true);
    });

    it('turns exclusivity off when asked', async () => {
        mockedRepository.findById.mockResolvedValue(orgWith({ role_1: { id: 'role_1', label: 'Seat', exclusive: true } }));
        const role = await updateRole('org-1', 'role_1', { label: 'Seat', exclusive: false }, AUTH);
        expect(role.exclusive).toBeUndefined();
    });
});
