import { describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (handler) => handler,
  getQuery: (event) => event.query || {},
  createError: (error) => Object.assign(new Error(error.message), error)
}));

vi.mock('../../features/cassettes/service.js', () => ({
  list: vi.fn(async () => [])
}));

vi.mock('../../utils/entity-redaction.js', () => ({
  serializeManyForAccess: vi.fn((typeId, items) => items)
}));

import handler from './index.get.js';
import * as cassetteService from '../../features/cassettes/service.js';

describe('GET /api/cassettes', () => {
  it('passes lineage filters to the cassette service', async () => {
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: null,
      effectivePermissions: {}
    };

    await handler({
      context: { auth },
      query: {
        libraryId: 'library-1',
        primaryStatuses: 'ACTIVE,DRAFT',
        limit: '25',
        skip: '5'
      }
    });

    expect(cassetteService.list).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      null,
      auth,
      expect.objectContaining({
        libraryId: 'library-1',
        primaryStatuses: 'ACTIVE,DRAFT',
        limit: 25,
        skip: 5
      })
    );
  });
});
