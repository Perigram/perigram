import { beforeEach, describe, expect, it, vi } from 'vitest';

const listEntityChanges = vi.fn();

vi.mock('h3', () => ({
  defineEventHandler: handler => handler,
  getQuery: vi.fn(event => event.query || {})
}));
vi.mock('~/server/utils/permissions.js', () => ({
  requireAuth: vi.fn(() => ({ userId: 'user-1', organizationId: 'org-1' }))
}));
vi.mock('~/server/features/instance-events/service.js', () => ({ listEntityChanges }));

const handler = (await import('./index.get.js')).default;

describe('GET /api/instance-events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns immediately with changes after the client cursor', () => {
    listEntityChanges.mockReturnValue({ cursor: 8, events: [] });

    expect(handler({ query: { after: '7' } })).toEqual({ cursor: 8, events: [] });
    expect(listEntityChanges).toHaveBeenCalledWith(
      { userId: 'user-1', organizationId: 'org-1' },
      { after: 7 }
    );
  });

  it('omits history on the initial cursor request', () => {
    handler({ query: {} });

    expect(listEntityChanges).toHaveBeenCalledWith(expect.any(Object), { after: null });
  });
});
