import { describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { migrateTechDrawingInstances } from './migrate-tech-drawing-instances.js';

function stubDb() {
  const files = {
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn().mockResolvedValue({})
  };
  const penId = new ObjectId();
  const standardId = new ObjectId();
  const pen_templates = { find: () => ({ toArray: vi.fn().mockResolvedValue([
    { _id: penId, identity: { name: 'Cut red' }, data: { stroke: { color: '#DC2626', weight: 0.6, pattern: 'SOLID' } }, lineage: {} }
  ]) }) };
  const layer_standards = { find: () => ({ toArray: vi.fn().mockResolvedValue([
    { _id: standardId, identity: { name: 'Cut outer' }, data: { code: 'cut.outer', category: 'cut', defaultPenId: String(penId), production: true, allowedGeometry: ['line'] }, lineage: {} }
  ]) }) };
  return { collection: name => ({ files, pen_templates, layer_standards }[name]), files, penId, standardId };
}

describe('migrate-tech-drawing-instances', () => {
  it('writes §3 docs with preserved ids, system tenancy, and the declared relation', async () => {
    const db = stubDb();
    const summary = await migrateTechDrawingInstances(db, { apply: true });

    expect(summary.pen_templates).toEqual({ scanned: 1, migrated: 1 });
    expect(summary.layer_standards).toEqual({ scanned: 1, migrated: 1 });

    const penDoc = db.files.insertOne.mock.calls[0][0];
    expect(penDoc.type).toBe('pen-template');
    expect(penDoc.organizationId).toBeNull();
    expect(penDoc.fields.stroke).toEqual({ color: '#DC2626', weight: 0.6, pattern: 'SOLID' });

    const standardDoc = db.files.insertOne.mock.calls[1][0];
    expect(standardDoc._id.toString()).toBe(db.standardId.toString());
    expect(standardDoc.type).toBe('layer-standard');
    expect(standardDoc.fields.code).toBe('cut.outer');
    expect(standardDoc.relations.defaultPen).toEqual({ type: 'pen-template', id: db.penId.toString() });
  });

  it('is idempotent: already-migrated docs are skipped without writing', async () => {
    const db = stubDb();
    db.files.findOne.mockResolvedValue({ type: 'pen-template' });
    const summary = await migrateTechDrawingInstances(db, { apply: true });
    expect(summary.pen_templates.migrated).toBe(0);
    expect(summary.layer_standards.migrated).toBe(0);
    expect(db.files.insertOne).not.toHaveBeenCalled();
  });

  it('never writes on dry-run', async () => {
    const db = stubDb();
    await migrateTechDrawingInstances(db, { apply: false });
    expect(db.files.insertOne).not.toHaveBeenCalled();
  });
});
