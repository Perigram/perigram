import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/server/features/users/service.js', () => ({
  list: vi.fn(async () => [
    { toJSON: () => ({ _id: 'user-1', identity: { name: 'Ada' }, data: { email: 'ada@perigram.dev', memberships: [{ organizationId: 'org-1' }], avatarUrl: '/api/users/user-1/avatar?v=1' } }) },
    { toJSON: () => ({ _id: 'user-2', identity: { name: 'Bo' }, data: { email: 'bo@perigram.dev', memberships: [{ organizationId: 'org-2' }] } }) },
    { toJSON: () => ({ _id: 'user-bot', identity: { name: 'Assistant' }, data: { email: 'assistant@bots.perigram.internal', memberships: [{ organizationId: 'org-1' }], bot: { createdAt: new Date(0) } } }) }
  ]),
  getById: vi.fn(async id => (
    {
      'user-1': { toJSON: () => ({ _id: 'user-1', identity: { name: 'Ada' }, data: { email: 'ada@perigram.dev', memberships: [{ organizationId: 'org-1' }], avatarUrl: '/api/users/user-1/avatar?v=1' } }) },
      'user-2': { toJSON: () => ({ _id: 'user-2', identity: { name: 'Bo' }, data: { email: 'bo@perigram.dev', memberships: [{ organizationId: 'org-2' }] } }) },
      'user-bot': { toJSON: () => ({ _id: 'user-bot', identity: { name: 'Assistant' }, data: { email: 'assistant@bots.perigram.internal', memberships: [{ organizationId: 'org-1' }], bot: { createdAt: new Date(0) } } }) }
    }[id] || null
  ))
}));

vi.mock('~/server/features/organizations/service.js', () => ({
  list: vi.fn(async () => [
    { toJSON: () => ({ _id: 'org-1', identity: { name: 'Perigram' }, data: { email: 'hi@perigram.dev' } }) }
  ]),
  getById: vi.fn(async id => (
    {
      'org-1': {
        toJSON: () => ({
          _id: 'org-1',
          identity: { name: 'Perigram' },
          data: { email: 'hi@perigram.dev', roleAssignments: { 'user-1': { userId: 'user-1', roleIds: ['role-operator'] } } }
        }),
        data: { email: 'hi@perigram.dev', roleAssignments: { 'user-1': { userId: 'user-1', roleIds: ['role-operator'] } } }
      }
    }[id] || null
  ))
}));

import { partyProcessBindings } from './party-wire.js';

const member = { userId: 'user-9', organizationId: 'org-1', memberships: [{ organizationId: 'org-1' }] };

describe('party process bindings (§3 wire, readable principals)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('projects the §3 wire shape — identity slots plus declared rows, nothing else', async () => {
    const dto = await partyProcessBindings.user.read('user-1', member);
    expect(dto).toEqual({
      _id: 'user-1',
      type: 'user',
      typeVersion: 1,
      name: 'Ada',
      fields: {
        name: 'Ada',
        email: 'ada@perigram.dev',
        roles: ['role-operator'],
        bot: false,
        avatarUrl: '/api/users/user-1/avatar?v=1'
      }
    });
  });

  it('carries the AI attribution marker and a null avatar for the assistant', async () => {
    const bot = await partyProcessBindings.user.read('user-bot', member);
    expect(bot.fields.bot).toBe(true);
    expect(bot.fields.avatarUrl).toBeNull();
    const human = await partyProcessBindings.user.read('user-1', member);
    expect(human.fields.bot).toBe(false);
  });

  it('derives the roles row from the active organization assignments — an unassigned member carries the empty set', async () => {
    const outsider = await partyProcessBindings.user.read('user-2', { userId: 'user-2', organizationId: 'org-1', memberships: [{ organizationId: 'org-1' }] });
    expect(outsider.fields.roles).toEqual([]);
    const orgless = await partyProcessBindings.user.read('user-1', { userId: 'user-1' });
    expect(orgless.fields.roles).toEqual([]);
  });

  it('maps the membership-scoped list through the same projection', async () => {
    const rows = await partyProcessBindings.organization.list({}, member);
    expect(rows).toEqual([{
      _id: 'org-1',
      type: 'organization',
      typeVersion: 1,
      name: 'Perigram',
      fields: { name: 'Perigram', email: 'hi@perigram.dev' }
    }]);
  });

  it('reads the acting user and shared-organization members, refuses strangers', async () => {
    await expect(partyProcessBindings.user.read('user-1', { userId: 'user-1' })).resolves.toMatchObject({ _id: 'user-1' });
    await expect(partyProcessBindings.user.read('user-1', member)).resolves.toMatchObject({ _id: 'user-1' });
    // user-2 lives only in org-2: an org-1 caller may not read it.
    const stranger = { ...member, userId: 'user-1' };
    await expect(partyProcessBindings.user.read('user-2', stranger)).rejects.toMatchObject({ statusCode: 403 });
    await expect(partyProcessBindings.user.read('missing', member)).resolves.toBeNull();
  });

  it('reads an organization for its members only', async () => {
    await expect(partyProcessBindings.organization.read('org-1', member)).resolves.toMatchObject({ _id: 'org-1' });
    await expect(partyProcessBindings.organization.read('org-1', { userId: 'user-x' })).rejects.toMatchObject({ statusCode: 403 });
  });
});
