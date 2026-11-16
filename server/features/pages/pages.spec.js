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
import * as pagesRepository from './repository.js';

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

  it('scopes the tree to the caller organization and excludes the document', async () => {
    const mine = await seedPage(ORG_A, { name: 'Mine' });
    await seedPage(ORG_B, { name: 'Theirs' });
    const tree = await pagesService.listTree(memberOf(ORG_A));
    expect(tree).toHaveLength(1);
    expect(tree[0]).toEqual({ _id: mine, name: 'Mine', parentId: null, kind: 'page', classTypeId: null });
  });

  it('answers a foreign page 404 on read, update, and delete', async () => {
    const foreign = await seedPage(ORG_B);
    const auth = memberOf(ORG_A);
    await expect(pagesService.getById(foreign, auth)).rejects.toMatchObject({ statusCode: 404 });
    await expect(pagesService.update(foreign, { name: 'x' }, auth)).rejects.toMatchObject({ statusCode: 404 });
    await expect(pagesService.remove(foreign, auth)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('keeps page repository writes tenant-scoped even if the caller passes a foreign id', async () => {
    const foreignId = new ObjectId();
    await db.collection('items').insertOne({
      _id: foreignId,
      type: 'page',
      organizationId: ORG_B,
      fields: { name: 'Protected' },
      lineage: {}
    });
    const changed = await pagesRepository.update(foreignId.toString(), { name: 'Tampered' }, ORG_A);
    expect(changed).toBeNull();
    await pagesRepository.remove(foreignId.toString(), ORG_A);
    const stillThere = await db.collection('items').findOne({ _id: foreignId, type: 'page' });
    expect(stillThere).toMatchObject({ organizationId: ORG_B, fields: { name: 'Protected' } });
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
    expect(tree).toEqual([{ _id: child, name: '', parentId: null, kind: 'page', classTypeId: null }]);
  });

  it('creates unnamed pages and sections; rename and blocks ride the patch', async () => {
    const section = await pagesService.create({ kind: 'section' }, memberOf(ORG_A));
    expect(section).toMatchObject({ kind: 'section', name: '', parentId: null });
    const page = await pagesService.create({ parentId: section._id }, memberOf(ORG_A));
    expect(page).toMatchObject({ kind: 'page', name: '', parentId: section._id });

    const blocks = [{ id: 'b1', kind: 'text', text: '# Notes' }];
    const saved = await pagesService.update(page._id, { name: 'Notes', blocks, order: ['b1'] }, memberOf(ORG_A));
    expect(saved).toMatchObject({ name: 'Notes', blocks, order: ['b1'] });
    const read = await pagesService.getById(page._id, memberOf(ORG_A));
    expect(read).toMatchObject({ name: 'Notes', blocks, order: ['b1'], parentId: section._id });
  });

  it('migrates legacy pages without deleting their source when an item ID belongs to another tenant', async () => {
    const id = new ObjectId();
    await db.collection('pages').insertOne({
      _id: id,
      organizationId: ORG_A,
      kind: 'page',
      name: 'Legacy source',
      content: 'Keep me',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await db.collection('items').insertOne({
      _id: id,
      type: 'page',
      organizationId: ORG_B,
      fields: { name: 'Foreign owner' },
      lineage: {}
    });

    await pagesRepository.migrateLegacy(ORG_A);

    expect(await db.collection('items').findOne({ _id: id })).toMatchObject({
      type: 'page',
      organizationId: ORG_B,
      fields: { name: 'Foreign owner' }
    });
    expect(await db.collection('pages').findOne({ _id: id, organizationId: ORG_A }))
      .toMatchObject({ name: 'Legacy source', content: 'Keep me' });
  });

  it('deletes a legacy source only after its canonical page is present', async () => {
    const id = new ObjectId();
    await db.collection('pages').insertOne({
      _id: id,
      organizationId: ORG_A,
      kind: 'page',
      name: 'Migrated',
      content: 'Legacy body',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await pagesRepository.migrateLegacy(ORG_A);

    expect(await db.collection('items').findOne({ _id: id })).toMatchObject({
      type: 'page',
      organizationId: ORG_A,
      fields: { name: 'Migrated', content: 'Legacy body' }
    });
    expect(await db.collection('pages').findOne({ _id: id })).toBeNull();
  });

  it('migrates legacy markdown content into ordered blocks', async () => {
    const page = await seedPage(ORG_A, {
      name: 'Legacy',
      content: 'Intro\n\n```view\n{"typeId":"widget","name":"Widgets"}\n```\n\nOutro\n'
    });
    const read = await pagesService.getById(page, memberOf(ORG_A));
    expect(read.content).toBeUndefined();
    expect(read.blocks.map(block => block.kind)).toEqual(['text', 'view', 'text']);
    expect(read.order).toEqual(read.blocks.map(block => block.id));
    expect(read.blocks[1].view).toMatchObject({ typeId: 'widget', name: 'Widgets' });
  });

  it('moves a page to another parent and back to the root', async () => {
    const a = await seedPage(ORG_A, { name: 'A' });
    const b = await seedPage(ORG_A, { name: 'B' });
    await pagesService.update(b, { parentId: a }, memberOf(ORG_A));
    await pagesService.update(b, { parentId: null }, memberOf(ORG_A));
    const tree = await pagesService.listTree(memberOf(ORG_A));
    expect(tree.every(row => row.parentId === null)).toBe(true);
  });

  it('returns the one page already bound to a class', async () => {
    const first = await pagesService.create({
      name: 'Widgets',
      classTypeId: 'widget',
      blocks: [{ id: 'v1', kind: 'view', view: { typeId: 'widget', name: 'Widgets' } }],
      order: ['v1']
    }, memberOf(ORG_A));
    const second = await pagesService.create({ name: 'Other', classTypeId: 'widget' }, memberOf(ORG_A));
    expect(second._id).toBe(first._id);
    const tree = await pagesService.listTree(memberOf(ORG_A));
    expect(tree).toEqual([{
      _id: first._id,
      name: 'Widgets',
      parentId: null,
      kind: 'page',
      classTypeId: 'widget'
    }]);
  });
});
