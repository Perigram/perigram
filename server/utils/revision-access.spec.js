import { beforeEach, describe, expect, it, vi } from 'vitest';

const getInstanceService = vi.fn();
vi.mock('~/server/runtime/app-registry.js', () => ({
  getAppRegistry: () => ({ getInstanceService })
}));

import { assertRevisionSourceReadable } from './revision-access.js';

describe('revision source authorization', () => {
  beforeEach(() => getInstanceService.mockReset());

  it('resolves the source through the ordinary instance read boundary', async () => {
    const processGetById = vi.fn(async () => ({ _id: 'source-1' }));
    getInstanceService.mockReturnValue({ processGetById });
    const auth = { userId: 'user-1', organizationId: 'org-1' };

    await expect(assertRevisionSourceReadable({
      data: { source: { type: 'cassette', id: 'source-1' } }
    }, auth)).resolves.toEqual({ _id: 'source-1' });

    expect(getInstanceService).toHaveBeenCalledWith('cassette');
    expect(processGetById).toHaveBeenCalledWith('source-1', {
      auth,
      userId: 'user-1',
      organizationId: 'org-1'
    });
  });

  it('derives organization context from membership when no active org is set', async () => {
    const processGetById = vi.fn(async () => ({ _id: 'source-1' }));
    getInstanceService.mockReturnValue({ processGetById });
    const auth = { userId: 'user-1', memberships: [{ organizationId: 'org-2' }] };

    await assertRevisionSourceReadable({
      data: { source: { type: 'cassette', id: 'source-1' } }
    }, auth);

    expect(processGetById.mock.calls[0][1].organizationId).toBe('org-2');
  });

  it('propagates the source read denial rather than exposing its revision', async () => {
    const denied = Object.assign(new Error('Permission denied'), { statusCode: 403 });
    getInstanceService.mockReturnValue({
      processGetById: vi.fn(async () => { throw denied; })
    });

    await expect(assertRevisionSourceReadable({
      data: { source: { type: 'cassette', id: 'source-1' } }
    }, { userId: 'user-1', organizationId: 'org-1' })).rejects.toBe(denied);
  });

  it('fails closed for malformed or unresolved source references', async () => {
    await expect(assertRevisionSourceReadable({ data: {} }, {}))
      .rejects.toMatchObject({ statusCode: 404 });
    getInstanceService.mockReturnValue(null);
    await expect(assertRevisionSourceReadable({
      data: { source: { type: 'cassette', id: 'source-1' } }
    }, {})).rejects.toMatchObject({ statusCode: 404 });
  });
});
