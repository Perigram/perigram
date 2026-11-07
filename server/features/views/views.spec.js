// Failure modes first (the views README contract): org scoping, foreign
// 404s, required name/typeId, and viewState fidelity — the saved lens
// round-trips verbatim.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

vi.mock('h3', () => ({
  createError: vi.fn(err => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as viewsService from './service.js';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

const memberOf = organizationId => ({ userId: 'user-1', organizationId });

// The persisted per-type view state over every control the popover edits.
const VIEW_STATE = {
  search: 'wall',
  filters: { and: [{ field: 'state', op: 'eq', value: 'active' }, { field: 'name', op: 'contains', value: 'w' }] },
  sort: { name: 'due', order: -1 },
  projection: 'board'
};

describe('views', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('views').deleteMany({});
  });

  async function seedView(organizationId, data = {}) {
    const now = new Date();
    const result = await db.collection('views').insertOne({
      organizationId,
      name: 'Lens',
      typeId: 't-wall',
      viewState: {},
      createdBy: 'user-1',
      createdAt: now,
      updatedAt: now,
      ...data
    });
    return result.insertedId.toString();
  }

  it('refuses every operation without an active organization', async () => {
    const auth = { userId: 'user-1', organizationId: null };
    await expect(viewsService.list(auth)).rejects.toMatchObject({ statusCode: 403 });
    await expect(viewsService.create({ name: 'L', typeId: 't' }, auth)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('scopes the list to the caller organization and filters by type', async () => {
    const wall = await seedView(ORG_A, { name: 'Walls', typeId: 't-wall' });
    await seedView(ORG_A, { name: 'Doors', typeId: 't-door' });
    await seedView(ORG_B, { name: 'Theirs', typeId: 't-wall' });
    const all = await viewsService.list(memberOf(ORG_A));
    expect(all.map(row => row.name)).toEqual(['Walls', 'Doors']);
    const walls = await viewsService.list(memberOf(ORG_A), { typeId: 't-wall' });
    expect(walls).toEqual([{ _id: wall, name: 'Walls', typeId: 't-wall' }]);
  });

  it('answers a foreign view 404 on read, update, and delete', async () => {
    const foreign = await seedView(ORG_B);
    const auth = memberOf(ORG_A);
    await expect(viewsService.getById(foreign, auth)).rejects.toMatchObject({ statusCode: 404 });
    await expect(viewsService.update(foreign, { name: 'x' }, auth)).rejects.toMatchObject({ statusCode: 404 });
    await expect(viewsService.remove(foreign, auth)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('requires a name and a type on create', async () => {
    const auth = memberOf(ORG_A);
    await expect(viewsService.create({ typeId: 't-wall' }, auth)).rejects.toMatchObject({ statusCode: 400 });
    await expect(viewsService.create({ name: '  ' }, auth)).rejects.toMatchObject({ statusCode: 400 });
    await expect(viewsService.create({ name: 'Lens', typeId: 't-wall' }, auth))
      .resolves.toMatchObject({ name: 'Lens', typeId: 't-wall' });
  });

  it('round-trips the view state verbatim', async () => {
    const created = await viewsService.create(
      { name: 'Lens', typeId: 't-wall', viewState: VIEW_STATE },
      memberOf(ORG_A)
    );
    const read = await viewsService.getById(created._id, memberOf(ORG_A));
    expect(read.viewState).toEqual(VIEW_STATE);
  });

  it('renames and replaces the view state through the patch; empty name refuses', async () => {
    const id = await seedView(ORG_A);
    const saved = await viewsService.update(id, { name: 'Wide', viewState: VIEW_STATE }, memberOf(ORG_A));
    expect(saved.name).toBe('Wide');
    expect(saved.viewState).toEqual(VIEW_STATE);
    await expect(viewsService.update(id, { name: '' }, memberOf(ORG_A)))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('deletes the view', async () => {
    const id = await seedView(ORG_A);
    await viewsService.remove(id, memberOf(ORG_A));
    const remaining = await viewsService.list(memberOf(ORG_A));
    expect(remaining).toEqual([]);
  });
});
