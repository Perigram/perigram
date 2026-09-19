import { describe, expect, it, vi } from 'vitest';
import { migrateInstanceTenancy } from './migrate-instance-tenancy.js';

function stubDb({ counts = {}, updates = {} } = {}) {
  const collections = {};
  const collection = name => collections[name] ||= {
    countDocuments: vi.fn().mockResolvedValue(counts[name] ?? 0),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: updates[name] ?? 0 })
  };
  return { collection, collections };
}

describe('migrate-instance-tenancy', () => {
  it('reports candidates per class collection without writing on dry-run', async () => {
    const db = stubDb({ counts: { files: 3, items: 1 } });
    const summary = await migrateInstanceTenancy(db);
    expect(summary).toEqual({
      files: { candidates: 3, migrated: 0 },
      items: { candidates: 1, migrated: 0 },
      groups: { candidates: 0, migrated: 0 },
      processes: { candidates: 0, migrated: 0 }
    });
    expect(db.collections.files.updateMany).not.toHaveBeenCalled();
  });

  it('moves the legacy lineage key into the top-level slot when apply is set', async () => {
    {
      const db = stubDb({ counts: { files: 2 }, updates: { files: 2 } });
      const summary = await migrateInstanceTenancy(db, { apply: true });
      expect(summary.files).toEqual({ candidates: 2, migrated: 2 });
      expect(db.collections.files.updateMany).toHaveBeenCalledWith(
        { 'lineage.organizationId': { $exists: true }, organizationId: { $exists: false } },
        [{ $set: { organizationId: '$lineage.organizationId' } }, { $unset: 'lineage.organizationId' }]
      );
    }
  });
});
