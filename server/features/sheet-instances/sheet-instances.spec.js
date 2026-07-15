import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, findByIdMock } = vi.hoisted(() => ({
  createMock: vi.fn(async document => document),
  findByIdMock: vi.fn()
}));

vi.mock('./repository.js', () => ({
  create: createMock,
  findById: findByIdMock,
  find: vi.fn(),
  updateById: vi.fn()
}));

import { createFromDesign } from './service.js';

describe('sheet instance creation', () => {
  beforeEach(() => {
    createMock.mockClear();
    findByIdMock.mockReset().mockResolvedValue(null);
  });

  it('creates deterministic digital twins owned by a revision-qualified sheet design', async () => {
    const instance = await createFromDesign({
      _id: 'sheet-design-1',
      identity: { uid: 'sheet-design-1', name: 'Canonical layout' },
      lineage: {
        queue: { entityType: 'queue', entityId: 'queue-1', revisionId: 'queue-revision-4' }
      },
      specs: { width: 3000, length: 1500 },
      data: {
        revisions: { geometry: { currentId: 'geometry-revision-2' } }
      }
    }, { sequence: 3, layoutHash: 'sha256:layout' }, 'user-1');

    expect(instance).toMatchObject({
      _id: 'sheet-instance-sheet-design-1-3',
      lineage: {
        queue: { entityType: 'queue', entityId: 'queue-1', revisionId: 'queue-revision-4' },
        sheetDesign: {
          entityType: 'sheet_design',
          entityId: 'sheet-design-1',
          revisionId: 'geometry-revision-2'
        }
      },
      data: {
        layoutHash: 'sha256:layout',
        sequence: 3,
        physicalSheetId: null
      }
    });
    expect(instance.data).not.toHaveProperty('sheetDesignId');
    expect(createMock).toHaveBeenCalledOnce();
  });

  it('returns an existing deterministic twin on task retry', async () => {
    findByIdMock.mockResolvedValue({
      _id: 'sheet-instance-sheet-design-1-1',
      identity: { uid: 'sheet-instance-sheet-design-1-1', name: 'Existing twin' },
      lineage: { sheetDesign: { entityType: 'sheet_design', entityId: 'sheet-design-1' } },
      data: { sequence: 1 }
    });

    const instance = await createFromDesign({
      _id: 'sheet-design-1',
      identity: { uid: 'sheet-design-1', name: 'Canonical layout' }
    });

    expect(instance._id).toBe('sheet-instance-sheet-design-1-1');
    expect(createMock).not.toHaveBeenCalled();
  });
});
