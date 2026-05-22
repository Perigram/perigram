import { describe, expect, it, vi } from 'vitest';
import { assertCommandAccess, hasEntityAccess } from './service.js';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

const entity = { lineage: { organizationId: 'org-1' } };
const auth = {
  userId: 'u1',
  memberships: [{ organizationId: 'org-1', permissions: { queues: 'write', artifacts: 'read' } }]
};

describe('access engine', () => {
  it('allows entity access by lineage membership permission level', () => {
    expect(hasEntityAccess({ entity, feature: 'queues', level: 'read', auth })).toBe(true);
    expect(hasEntityAccess({ entity, feature: 'queues', level: 'write', auth })).toBe(true);
  });

  it('denies missing org membership or insufficient permission level', () => {
    expect(hasEntityAccess({ entity, feature: 'queues', level: 'admin', auth })).toBe(false);
    expect(hasEntityAccess({
      entity,
      feature: 'queues',
      level: 'read',
      auth: { memberships: [{ organizationId: 'org-2', permissions: { queues: 'admin' } }] }
    })).toBe(false);
  });

  it('checks command requirements before handler execution', () => {
    const command = {
      access: {
        permissions: [
          { feature: 'queues', level: 'write' },
          { feature: 'artifacts', level: 'write' }
        ]
      }
    };

    expect(() => assertCommandAccess({ command, entities: { queue: entity }, auth })).toThrow(/artifacts:write/);
  });
});
