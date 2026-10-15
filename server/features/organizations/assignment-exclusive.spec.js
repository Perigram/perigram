import { describe, it, expect, beforeEach, vi } from 'vitest';

// Single-seat assignment at the repository write boundary: assigning a
// held seat moves it — displaced holders keep their other roles, emptied
// rows disappear, shared roles and same-holder writes stay untouched.

const { connectDB, collection, updates } = vi.hoisted(() => {
    const updates = [];
    const fakeCollection = {
        findOne: vi.fn(),
        updateOne: vi.fn(async (filter, doc) => {
            updates.push(doc);
            return { matchedCount: 1 };
        })
    };
    return {
        connectDB: vi.fn(async () => ({ collection: () => fakeCollection })),
        collection: fakeCollection,
        updates
    };
});

vi.mock('~/server/db/mongo', () => ({ connectDB }));

import { setRoleAssignment } from './repository.js';

beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
});

it('displaces the previous holder and keeps their other roles', async () => {
    collection.findOne.mockResolvedValue({
        data: {
            roles: { role_seat: { id: 'role_seat', label: 'Seat', exclusive: true }, role_other: { id: 'role_other', label: 'Other' } },
            roleAssignments: {
                human: { userId: 'human', roleIds: ['role_seat', 'role_other'] }
            }
        }
    });
    await setRoleAssignment('org-1', 'bot-1', { userId: 'bot-1', roleIds: ['role_seat'], bindings: {} });
    expect(updates).toEqual([
        { $set: { 'data.roleAssignments.human.roleIds': ['role_other'] } },
        { $set: { 'data.roleAssignments.bot-1': { userId: 'bot-1', roleIds: ['role_seat'], bindings: {} } } }
    ]);
});

it('removes a displaced holder whose assignment becomes empty', async () => {
    collection.findOne.mockResolvedValue({
        data: {
            roles: { role_seat: { id: 'role_seat', label: 'Seat', exclusive: true } },
            roleAssignments: {
                human: { userId: 'human', roleIds: ['role_seat'] }
            }
        }
    });
    await setRoleAssignment('org-1', 'bot-1', { userId: 'bot-1', roleIds: ['role_seat'], bindings: {} });
    expect(updates[0]).toEqual({ $unset: { 'data.roleAssignments.human': '' } });
});

it('keeps the seat with its current holder on a same-holder write', async () => {
    collection.findOne.mockResolvedValue({
        data: {
            roles: { role_seat: { id: 'role_seat', label: 'Seat', exclusive: true } },
            roleAssignments: {
                'bot-1': { userId: 'bot-1', roleIds: ['role_seat'] }
            }
        }
    });
    await setRoleAssignment('org-1', 'bot-1', { userId: 'bot-1', roleIds: ['role_seat', 'role_other'], bindings: {} });
    expect(updates).toEqual([
        { $set: { 'data.roleAssignments.bot-1': { userId: 'bot-1', roleIds: ['role_seat', 'role_other'], bindings: {} } } }
    ]);
});

it('leaves shared-role writes single-op (the read decides exclusivity)', async () => {
    collection.findOne.mockResolvedValue({
        data: {
            roles: { role_other: { id: 'role_other', label: 'Other' } },
            roleAssignments: {}
        }
    });
    await setRoleAssignment('org-1', 'bot-1', { userId: 'bot-1', roleIds: ['role_other'], bindings: {} });
    expect(updates).toEqual([
        { $set: { 'data.roleAssignments.bot-1': { userId: 'bot-1', roleIds: ['role_other'], bindings: {} } } }
    ]);
});
