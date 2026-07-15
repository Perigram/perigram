import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn()
}));

vi.mock('./repository.js', () => mocks);
vi.mock('h3', () => ({
  createError: vi.fn(input => Object.assign(new Error(input.message), { statusCode: input.statusCode }))
}));

import { ensureSystemDefault } from './service.js';

describe('machine service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(null);
    mocks.create.mockImplementation(async value => value);
  });

  it('seeds the default machine with one stable entity identity', async () => {
    const machine = await ensureSystemDefault();

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'machine-system-default',
      identity: expect.objectContaining({ uid: 'machine-system-default' }),
      lineage: expect.objectContaining({ scope: 'system', public: true })
    }));
    expect(machine).toMatchObject({
      _id: 'machine-system-default',
      identity: { uid: 'machine-system-default' },
      data: {
        workArea: { width: 3000, length: 1500 },
        boundaryOffset: { top: 10, right: 10, bottom: 10, left: 10 },
        default: true
      }
    });
  });
});
