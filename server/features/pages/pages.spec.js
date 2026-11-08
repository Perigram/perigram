// Failure modes first (the pages README contract): org scoping, cycle
// refusal, section root law, detach-on-delete, and the tree projection.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

vi.mock('../cts-types/service.js', () => ({
  compileRegistryForOrganization: vi.fn(async () => ({ getType: vi.fn(() => ({ id: 'page' })) })),
  defineType: vi.fn()
}));

vi.mock('h3', () => ({
  createError: vi.fn(err => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as pagesService from './service.js';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

const memberOf = organizationId => ({ userId: 'user-1', organizationId });

describe('pages', () => {
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
    await db.collection('pages').deleteMany({});
    await db.collection('items').deleteMany({});
  });

  async function seedPage(organizationId, data = {}) {
    const now = new Date();
    const result = await db.collection('pages').insertOne({
      organizationId,
      kind: 'page',
      name: '',
      parentId: null,
      content: '',
      createdBy: 'user-1',
      createdAt: now,
      updatedAt: now,
      // The stored parent ref is the ObjectId the service writes.
      ...(data.parentId ? { ...data, parentId: new ObjectId(data.parentId) } : data)
    });
    return result.insertedId.toString();
  }

  it('refuses every operation without an active organization', async () => {
    const auth = { userId: 'user-1', organizationId: null };
    await expect(pagesService.listTree(auth)).rejects.toMatchObject({ statusCode: 403 });
    await expect(pagesService.create({}, auth)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('scopes the tree to the caller organization and excludes content', async () => {
    const mine = await seedPage(ORG_A, { name: 'Mine' });
    await seedPage(ORG_B, { name: 'Theirs' });
    const tree = await pagesService.listTree(memberOf(ORG_A));
    expect(tree).toHaveLength(1);
    expect(tree[0]).toEqual({ _id: mine, name: 'Mine', parentId: null, kind: 'page' });
  });

  it('answers a foreign page 404 on read, update, and delete', async () => {
    const foreign = await seedPage(ORG_B);
    const auth = memberOf(ORG_A);
    await expect(pagesService.getById(foreign, auth)).rejects.toMatchObject({ statusCode: 404 });
    await expect(pagesService.update(foreign, { name: 'x' }, auth)).rejects.toMatchObject({ statusCode: 404 });
    await expect(pagesService.remove(foreign, auth)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a move that would create a cycle', async () => {
    const parent = await seedPage(ORG_A, { name: 'Parent' });
    const child = await seedPage(ORG_A, { name: 'Child', parentId: parent });
    await expect(pagesService.update(parent, { parentId: child }, memberOf(ORG_A)))
      .rejects.toMatchObject({ statusCode: 400 });
    const grandChild = await seedPage(ORG_A, { name: 'Grandchild', parentId: child });
    await expect(pagesService.update(parent, { parentId: grandChild }, memberOf(ORG_A)))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('keeps sections root-only', async () => {
    const page = await seedPage(ORG_A);
    await expect(pagesService.create({ kind: 'section', parentId: page }, memberOf(ORG_A)))
      .rejects.toMatchObject({ statusCode: 400 });
    const section = await pagesService.create({ kind: 'section' }, memberOf(ORG_A));
    await expect(pagesService.update(section._id, { parentId: page }, memberOf(ORG_A)))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses an unknown or foreign parent', async () => {
    await expect(pagesService.create({ parentId: 'missing' }, memberOf(ORG_A)))
      .rejects.toMatchObject({ statusCode: 400 });
    const foreign = await seedPage(ORG_B);
    await expect(pagesService.create({ parentId: foreign }, memberOf(ORG_A)))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('detaches children on delete — children become roots', async () => {
    const parent = await seedPage(ORG_A);
    const child = await seedPage(ORG_A, { parentId: parent });
    await pagesService.remove(parent, memberOf(ORG_A));
    const tree = await pagesService.listTree(memberOf(ORG_A));
    expect(tree).toEqual([{ _id: child, name: '', parentId: null, kind: 'page' }]);
  });

  it('creates unnamed pages and sections; rename and content ride the patch', async () => {
    const section = await pagesService.create({ kind: 'section' }, memberOf(ORG_A));
    expect(section).toMatchObject({ kind: 'section', name: '', parentId: null });
    const page = await pagesService.create({ parentId: section._id }, memberOf(ORG_A));
    expect(page).toMatchObject({ kind: 'page', name: '', parentId: section._id });

    const saved = await pagesService.update(page._id, { name: 'Notes', content: '# Notes' }, memberOf(ORG_A));
    expect(saved).toMatchObject({ name: 'Notes', content: '# Notes' });
    const read = await pagesService.getById(page._id, memberOf(ORG_A));
    expect(read).toMatchObject({ name: 'Notes', content: '# Notes', parentId: section._id });
  });

  it('moves a page to another parent and back to the root', async () => {
    const a = await seedPage(ORG_A, { name: 'A' });
    const b = await seedPage(ORG_A, { name: 'B' });
    await pagesService.update(b, { parentId: a }, memberOf(ORG_A));
    await pagesService.update(b, { parentId: null }, memberOf(ORG_A));
    const tree = await pagesService.listTree(memberOf(ORG_A));
    expect(tree.every(row => row.parentId === null)).toBe(true);
  });
});
