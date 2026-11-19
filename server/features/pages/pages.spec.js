// Failure modes first (the pages README contract): org scoping, cycle
// refusal, section root law, detach-on-delete, and the tree projection.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { mockedConnectDB, getAppRegistry, getRevisionById, assertRevisionSourceReadable, resolvePinnedGraph, evaluateSavedGraph } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn(),
  getAppRegistry: vi.fn(),
  getRevisionById: vi.fn(),
  assertRevisionSourceReadable: vi.fn(),
  resolvePinnedGraph: vi.fn(),
  evaluateSavedGraph: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));
vi.mock('~/server/runtime/app-registry.js', () => ({ getAppRegistry }));
vi.mock('../instance-revisions/service.js', () => ({ getById: getRevisionById }));
vi.mock('~/server/utils/revision-access.js', () => ({ assertRevisionSourceReadable }));
vi.mock('../graph-executions/service.js', () => ({
  resolvePinnedGraph: resolvePinnedGraph,
  evaluateSavedGraph: evaluateSavedGraph
}));

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
import { getOrganizationChangeSequence } from '../instances/index.js';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

const memberOf = organizationId => ({ userId: 'user-1', organizationId });

describe('pages', () => {
  let con;
  let mongoServer;
  let db;

  const defaultRegistry = () => ({ getInstanceService: () => ({ processGetById: vi.fn(async id => ({ _id: id, type: 'part', fields: { code: 'A' } })) }) });

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
    getAppRegistry.mockReturnValue(defaultRegistry());
    getRevisionById.mockResolvedValue({ _id: 'revision:part:part-2:content:3', data: { source: { type: 'part', id: 'part-2' }, snapshot: { fields: { code: 'B' } } } });
    assertRevisionSourceReadable.mockResolvedValue({ _id: 'part-2', type: 'part' });
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('pages').deleteMany({});
    await db.collection('items').deleteMany({});
    await db.collection('files.files').deleteMany({});
    await db.collection('files.chunks').deleteMany({});
    await db.collection('organization_change_sequences').deleteMany({});
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

  it('resolves live and pinned typed references through authorized source and exact revision reads', async () => {
    const page = await pagesService.create({ name: 'References', blocks: [
      { id: 'live', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-1' } },
      { id: 'pinned', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-2', revisionId: 'revision:part:part-2:content:3' } }
    ], order: ['live', 'pinned'] }, memberOf(ORG_A));
    const auth = memberOf(ORG_A);
    const resolved = await pagesService.resolveReferences(page._id, auth);
    expect(resolved).toEqual([
      { blockId: 'live', status: 'resolved', mode: 'live', typeId: 'part', instanceId: 'part-1', instance: { _id: 'part-1', type: 'part', fields: { code: 'A' } } },
      { blockId: 'pinned', status: 'resolved', mode: 'pinned', typeId: 'part', instanceId: 'part-2', revisionId: 'revision:part:part-2:content:3', revision: expect.objectContaining({ _id: 'revision:part:part-2:content:3' }) }
    ]);
    expect(getRevisionById).toHaveBeenCalledWith('revision:part:part-2:content:3', auth.userId, auth.role, auth);
    expect(assertRevisionSourceReadable).toHaveBeenCalledWith(expect.objectContaining({ _id: 'revision:part:part-2:content:3' }), auth);
  });

  it('maps inaccessible live targets to the same unavailable response as missing targets', async () => {
    const page = await pagesService.create({ name: 'Denied reference', blocks: [
      { id: 'live', kind: 'reference', ref: { typeId: 'part', instanceId: 'foreign-part' } }
    ], order: ['live'] }, memberOf(ORG_A));
    getAppRegistry.mockReturnValue({ getInstanceService: () => ({ processGetById: vi.fn(async () => { throw Object.assign(new Error('denied'), { statusCode: 403 }); }) }) });
    const result = await pagesService.resolveReferences(page._id, memberOf(ORG_A));
    expect(result).toEqual([{ blockId: 'live', status: 'unavailable' }]);
    getAppRegistry.mockReturnValue(defaultRegistry());
  });

  it('never falls a pinned reference forward when its exact revision is unavailable', async () => {
    const page = await pagesService.create({ name: 'Unavailable pin', blocks: [
      { id: 'pinned', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-2', revisionId: 'missing-revision' } }
    ], order: ['pinned'] }, memberOf(ORG_A));
    getRevisionById.mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 404 }));
    const result = await pagesService.resolveReferences(page._id, memberOf(ORG_A));
    expect(result).toEqual([{ blockId: 'pinned', status: 'unavailable' }]);
  });

  it('returns the same unavailable state when a pinned revision belongs to another source', async () => {
    const page = await pagesService.create({ name: 'Mismatched pin', blocks: [
      { id: 'pinned', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-2', revisionId: 'wrong-source-revision' } }
    ], order: ['pinned'] }, memberOf(ORG_A));
    getRevisionById.mockResolvedValueOnce({ _id: 'wrong-source-revision', data: { source: { type: 'part', id: 'somebody-else' } } });
    const result = await pagesService.resolveReferences(page._id, memberOf(ORG_A));
    expect(result).toEqual([{ blockId: 'pinned', status: 'unavailable' }]);
  });

  it('derives backlinks from page reference blocks, including pinned references', async () => {
    await pagesService.create({ name: 'Source page', blocks: [
      { id: 'ref-live', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-1' } },
      { id: 'ref-pinned', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-1', revisionId: 'rev-1' } }
    ], order: ['ref-live', 'ref-pinned'] }, memberOf(ORG_A));
    const backlinks = await pagesService.findBacklinks('part', 'part-1', memberOf(ORG_A));
    expect(backlinks).toHaveLength(2);
    expect(backlinks.map(item => item.mode)).toEqual(['live', 'pinned']);
    expect(backlinks.every(item => item.pageName === 'Source page')).toBe(true);
  });

  const graphOutputSource = {
    kind: 'graph-output',
    executionInstanceId: 'execution-instance-1',
    graphDocumentInstanceId: 'graph-instance-1',
    graphId: 'graph.report',
    graphRevision: 'rev-2',
    outputId: 'rows'
  };

  const parameterizedGraphRegistry = (executionRecord, partFields) => getAppRegistry.mockReturnValue({
    getInstanceService: typeId => ({
      'graph-execution': { processGetById: vi.fn(async () => executionRecord) },
      part: { processGetById: vi.fn(async id => ({ _id: id, type: 'part', fields: partFields(id) })) }
    }[typeId] || null)
  });

  const parameterizedSavedGraph = inputs => ({
    id: 'graph.report',
    revision: 'rev-2',
    interface: {
      inputs,
      outputs: [{ id: 'rows', label: 'Rows', contract: { shape: 'list' } }]
    }
  });

  it('merges parameter overrides over the pinned execution inputs and changes the resolved results', async () => {
    parameterizedGraphRegistry(
      { _id: 'execution-instance-1', fields: {
        executionId: 'execution-1', graphId: 'graph.report', graphRevision: 'rev-2',
        graphDocument: { type: 'graph-document', id: 'graph-instance-1' },
        status: 'succeeded', inputs: { limit: 5, region: 'eu' }
      } },
      id => ({ code: id })
    );
    resolvePinnedGraph.mockResolvedValue({
      graph: parameterizedSavedGraph([
        { id: 'limit', required: true, contract: { shape: 'item' } },
        { id: 'region', contract: { shape: 'item' } },
        { id: 'fresh', required: true, contract: { shape: 'item' }, default: true }
      ])
    });
    evaluateSavedGraph.mockImplementation(async ({ inputBindings }) => ({
      outputs: { rows: inputBindings.limit === 20 ? [{ type: 'part', id: 'item-2' }] : [{ type: 'part', id: 'item-1' }] }
    }));
    const auth = memberOf(ORG_A);
    const page = await pagesService.create({ name: 'Bound', blocks: [
      { id: 'c-overridden', kind: 'collection', collection: { source: graphOutputSource, parameters: { limit: 20 }, resultPolicy: 'pinned' } },
      { id: 'c-standing', kind: 'collection', collection: { source: graphOutputSource, parameters: { limit: 5 }, resultPolicy: 'pinned' } }
    ], order: ['c-overridden', 'c-standing'] }, auth);

    const resolved = await pagesService.resolveReferences(page._id, auth);

    expect(evaluateSavedGraph).toHaveBeenCalledWith({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings: { limit: 20, region: 'eu' }
    }, auth);
    expect(evaluateSavedGraph).toHaveBeenLastCalledWith({
      graphDocumentInstanceId: 'graph-instance-1',
      inputBindings: { limit: 5, region: 'eu' }
    }, auth);
    expect(resolved).toEqual([
      expect.objectContaining({ blockId: 'c-overridden', status: 'resolved', mode: 'parameterized', label: 'Rows', itemCount: 1, items: [{ kind: 'instance', typeId: 'part', instanceId: 'item-2', instance: { _id: 'item-2', type: 'part', fields: { code: 'item-2' } } }] }),
      expect.objectContaining({ blockId: 'c-standing', status: 'resolved', mode: 'parameterized', items: [{ kind: 'instance', typeId: 'part', instanceId: 'item-1', instance: expect.objectContaining({ _id: 'item-1' }) }] })
    ]);
  });

  it('renders the shared unavailable state for unbound or undeclared parameters', async () => {
    evaluateSavedGraph.mockClear();
    parameterizedGraphRegistry(
      { _id: 'execution-instance-1', fields: {
        executionId: 'execution-1', graphId: 'graph.report', graphRevision: 'rev-2',
        graphDocument: { type: 'graph-document', id: 'graph-instance-1' },
        status: 'succeeded', inputs: {}
      } },
      () => ({ code: 'A' })
    );
    resolvePinnedGraph.mockResolvedValue({
      graph: parameterizedSavedGraph([
        { id: 'limit', required: true, contract: { shape: 'item' } },
        { id: 'region', contract: { shape: 'item' } }
      ])
    });
    const auth = memberOf(ORG_A);
    const page = await pagesService.create({ name: 'Unbound', blocks: [
      { id: 'c-unbound', kind: 'collection', collection: { source: graphOutputSource, parameters: { region: 'eu' }, resultPolicy: 'pinned' } },
      { id: 'c-undeclared', kind: 'collection', collection: { source: graphOutputSource, parameters: { limit: 20, mystery: 1 }, resultPolicy: 'pinned' } }
    ], order: ['c-unbound', 'c-undeclared'] }, auth);

    const resolved = await pagesService.resolveReferences(page._id, auth);

    expect(resolved).toEqual([
      { blockId: 'c-unbound', status: 'unavailable' },
      { blockId: 'c-undeclared', status: 'unavailable' }
    ]);
    expect(evaluateSavedGraph).not.toHaveBeenCalled();
  });

  it('resolves live embeds by evaluating the pinned graph revision with their parameters', async () => {
    evaluateSavedGraph.mockClear();
    parameterizedGraphRegistry(null, id => ({ code: id }));
    resolvePinnedGraph.mockResolvedValue({ graph: parameterizedSavedGraph([{ id: 'limit', required: true, contract: { shape: 'item' } }]) });
    evaluateSavedGraph.mockImplementation(async ({ inputBindings }) => ({
      outputs: { rows: inputBindings.limit === 20 ? [{ type: 'part', id: 'live-item' }] : [] }
    }));
    const auth = memberOf(ORG_A);
    const liveSource = {
      kind: 'graph-output',
      graphDocumentInstanceId: 'graph-instance-1',
      graphId: 'graph.report',
      graphRevision: 'rev-2',
      outputId: 'rows'
    };
    const page = await pagesService.create({ name: 'Live', blocks: [
      { id: 'c-live', kind: 'collection', collection: { source: liveSource, parameters: { limit: 20 }, resultPolicy: 'live' } }
    ], order: ['c-live'] }, auth);

    const resolved = await pagesService.resolveReferences(page._id, auth);

    expect(evaluateSavedGraph).toHaveBeenCalledWith({
      graphDocumentInstanceId: 'graph-instance-1',
      graphRevision: 'rev-2',
      inputBindings: { limit: 20 }
    }, auth);
    expect(resolved).toEqual([
      expect.objectContaining({
        blockId: 'c-live',
        status: 'resolved',
        mode: 'live',
        label: 'Rows',
        itemCount: 1,
        items: [{ kind: 'instance', typeId: 'part', instanceId: 'live-item', instance: expect.objectContaining({ _id: 'live-item' }) }]
      })
    ]);
  });

  it('maps a failed live evaluation to the shared unavailable state', async () => {
    evaluateSavedGraph.mockClear();
    parameterizedGraphRegistry(null, () => ({ code: 'A' }));
    resolvePinnedGraph.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 404 }));
    evaluateSavedGraph.mockRejectedValue(Object.assign(new Error('invalid'), { statusCode: 400 }));
    const auth = memberOf(ORG_A);
    const page = await pagesService.create({ name: 'Live failed', blocks: [
      { id: 'c-live-failed', kind: 'collection', collection: { source: {
        kind: 'graph-output', graphDocumentInstanceId: 'graph-instance-1', graphId: 'graph.report', graphRevision: 'rev-9', outputId: 'rows'
      }, parameters: {}, resultPolicy: 'live' } }
    ], order: ['c-live-failed'] }, auth);

    const resolved = await pagesService.resolveReferences(page._id, auth);

    expect(resolved).toEqual([{ blockId: 'c-live-failed', status: 'unavailable' }]);
  });

  it('renders the shared unavailable state when the pinned execution drifts or is unreadable', async () => {
    evaluateSavedGraph.mockClear();
    const executionFields = {
      executionId: 'execution-1', graphId: 'graph.report', graphRevision: 'rev-2',
      graphDocument: { type: 'graph-document', id: 'graph-instance-1' },
      status: 'succeeded', inputs: { limit: 5 }
    };
    parameterizedGraphRegistry({ _id: 'execution-instance-1', fields: executionFields }, () => ({ code: 'A' }));
    resolvePinnedGraph.mockResolvedValue({ graph: parameterizedSavedGraph([{ id: 'limit', required: true, contract: { shape: 'item' } }]) });
    evaluateSavedGraph.mockResolvedValue({ outputs: { rows: [] } });
    const stale = await pagesService.create({ name: 'Stale pin', blocks: [
      { id: 'c-stale', kind: 'collection', collection: { source: { ...graphOutputSource, graphRevision: 'rev-1' }, parameters: { limit: 20 }, resultPolicy: 'pinned' } }
    ], order: ['c-stale'] }, memberOf(ORG_A));
    expect(await pagesService.resolveReferences(stale._id, memberOf(ORG_A))).toEqual([{ blockId: 'c-stale', status: 'unavailable' }]);

    getAppRegistry.mockReturnValue({
      getInstanceService: typeId => (typeId === 'graph-execution'
        ? { processGetById: vi.fn(async () => { throw Object.assign(new Error('denied'), { statusCode: 403 }); }) }
        : { processGetById: vi.fn(async id => ({ _id: id, type: 'part', fields: { code: 'A' } })) })
    });
    const denied = await pagesService.create({ name: 'Denied pin', blocks: [
      { id: 'c-denied', kind: 'collection', collection: { source: graphOutputSource, parameters: { limit: 20 }, resultPolicy: 'pinned' } }
    ], order: ['c-denied'] }, memberOf(ORG_A));
    expect(await pagesService.resolveReferences(denied._id, memberOf(ORG_A))).toEqual([{ blockId: 'c-denied', status: 'unavailable' }]);
    expect(evaluateSavedGraph).not.toHaveBeenCalled();
  });

  it('renders a pinned reference from its retained revision while the live reference tracks the changed source', async () => {
    getAppRegistry.mockReturnValue({
      getInstanceService: () => ({ processGetById: vi.fn(async id => ({ _id: id, type: 'part', fields: { code: 'CHANGED' } })) })
    });
    getRevisionById.mockResolvedValue({ _id: 'revision:part:part-2:content:3', data: { source: { type: 'part', id: 'part-2' }, snapshot: { fields: { code: 'B' } } } });
    const page = await pagesService.create({ name: 'Frozen reference', blocks: [
      { id: 'live', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-2' } },
      { id: 'pinned', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-2', revisionId: 'revision:part:part-2:content:3' } }
    ], order: ['live', 'pinned'] }, memberOf(ORG_A));

    const resolved = await pagesService.resolveReferences(page._id, memberOf(ORG_A));

    expect(resolved[0]).toMatchObject({ blockId: 'live', status: 'resolved', mode: 'live', instance: { fields: { code: 'CHANGED' } } });
    expect(resolved[1]).toMatchObject({ blockId: 'pinned', status: 'resolved', mode: 'pinned', revision: { data: { snapshot: { fields: { code: 'B' } } } } });
  });

  it('persists a frozen collection snapshot without a resolution entry', async () => {
    const snapshot = { label: 'Rows', itemCount: 2, truncated: true, items: [{ kind: 'value', value: 'a' }, { kind: 'unavailable' }] };
    const page = await pagesService.create({ name: 'Frozen', blocks: [
      { id: 'c-frozen', kind: 'collection', collection: { source: graphOutputSource, parameters: {}, snapshot, resultPolicy: 'frozen' } }
    ], order: ['c-frozen'] }, memberOf(ORG_A));
    const read = await pagesService.getById(page._id, memberOf(ORG_A));
    expect(read.blocks[0].collection).toMatchObject({ resultPolicy: 'frozen', snapshot });
    await expect(pagesService.resolveReferences(page._id, memberOf(ORG_A))).resolves.toEqual([]);
  });

  const snapshotGrantsRegistry = () => getAppRegistry.mockReturnValue({
    getInstanceService: typeId => (typeId === 'part' ? {
      processGetById: vi.fn(async (id, auth) => {
        if (id === 'part-deleted') return null;
        if (auth.userId === 'user-b' && id === 'part-2') throw Object.assign(new Error('denied'), { statusCode: 403 });
        return { _id: id, type: 'part', fields: { code: 'CHANGED' } };
      })
    } : null)
  });

  it('serves frozen record items through the current viewer read grants', async () => {
    snapshotGrantsRegistry();
    const memberA = { userId: 'user-a', organizationId: ORG_A };
    const memberB = { userId: 'user-b', organizationId: ORG_A };
    const page = await pagesService.create({ name: 'Frozen grants', blocks: [
      { id: 'c-frozen', kind: 'collection', collection: { source: graphOutputSource, parameters: {}, resultPolicy: 'frozen', snapshot: { label: 'Rows', itemCount: 4, truncated: false, items: [
        { kind: 'instance', typeId: 'part', instanceId: 'part-1', instance: { _id: 'part-1', type: 'part', fields: { code: 'A' } } },
        { kind: 'record', typeId: 'part', instanceId: 'part-2', instance: { _id: 'part-2', type: 'part', fields: { code: 'SECRET' } } },
        { kind: 'record', typeId: 'part', instanceId: 'part-deleted', instance: { _id: 'part-deleted', type: 'part', fields: { code: 'GONE' } } },
        { kind: 'value', value: 'plain' }
      ] } } }
    ], order: ['c-frozen'] }, memberA);

    const servedItems = async auth => (await pagesService.getById(page._id, auth)).blocks[0].collection.snapshot.items;
    const capturedPart1 = { kind: 'record', typeId: 'part', instanceId: 'part-1', instance: { _id: 'part-1', type: 'part', fields: { code: 'A' } } };
    expect(await servedItems(memberA)).toEqual([
      capturedPart1,
      { kind: 'record', typeId: 'part', instanceId: 'part-2', instance: { _id: 'part-2', type: 'part', fields: { code: 'SECRET' } } },
      { kind: 'unavailable' },
      { kind: 'value', value: 'plain' }
    ]);
    const deniedRead = await pagesService.getById(page._id, memberB);
    expect(deniedRead.blocks[0].collection.snapshot.items).toEqual([
      capturedPart1,
      { kind: 'unavailable' },
      { kind: 'unavailable' },
      { kind: 'value', value: 'plain' }
    ]);
    expect(JSON.stringify(deniedRead)).not.toContain('SECRET');
    getAppRegistry.mockReturnValue(defaultRegistry());
  });

  it('keeps the stored snapshot when a member without the record grant saves the page', async () => {
    snapshotGrantsRegistry();
    const memberA = { userId: 'user-a', organizationId: ORG_A };
    const memberB = { userId: 'user-b', organizationId: ORG_A };
    const page = await pagesService.create({ name: 'Frozen round-trip', blocks: [
      { id: 'c-frozen', kind: 'collection', collection: { source: graphOutputSource, parameters: {}, resultPolicy: 'frozen', snapshot: { label: 'Rows', itemCount: 2, truncated: false, items: [
        { kind: 'record', typeId: 'part', instanceId: 'part-2', instance: { _id: 'part-2', type: 'part', fields: { code: 'SECRET' } } },
        { kind: 'value', value: 'plain' }
      ] } } }
    ], order: ['c-frozen'] }, memberA);

    const maskedRead = await pagesService.getById(page._id, memberB);
    await pagesService.update(page._id, { blocks: maskedRead.blocks, order: maskedRead.order }, memberB);

    const read = await pagesService.getById(page._id, memberA);
    expect(read.blocks[0].collection.snapshot.items).toEqual([
      { kind: 'record', typeId: 'part', instanceId: 'part-2', instance: { _id: 'part-2', type: 'part', fields: { code: 'SECRET' } } },
      { kind: 'value', value: 'plain' }
    ]);
    getAppRegistry.mockReturnValue(defaultRegistry());
  });

  it('bakes an output to a page path and creates immutable file revisions on conflict', async () => {
    const page = await pagesService.create({ name: 'Artifacts' }, memberOf(ORG_A));
    const expectedOrganizationSequence = await getOrganizationChangeSequence(ORG_A);
    const first = await pagesService.bakeFile({
      pageId: page._id,
      path: 'exports/result.json',
      expectedOrganizationSequence,
      buffer: Buffer.from('{"value":1}'),
      mimeType: 'application/json',
      provenance: { graphId: 'graph-1', graphRevision: 'rev-1', executionId: 'exec-1', outputId: 'result' }
    }, memberOf(ORG_A));

    expect(first.file).toMatchObject({ path: 'exports/result.json', revision: 1, mime: 'application/json' });
    await expect(getOrganizationChangeSequence(ORG_A)).resolves.toBe(expectedOrganizationSequence + 1);
    expect(first.page.blocks.find(block => block.kind === 'file')?.file.fileId).toBe(first.file.fileId);
    const stored = await db.collection('files.files').findOne({ _id: new ObjectId(first.file.fileId) });
    expect(stored.metadata).toMatchObject({
      organizationId: ORG_A,
      pageId: page._id,
      logicalPath: 'exports/result.json',
      graphId: 'graph-1',
      graphRevision: 'rev-1',
      executionId: 'exec-1',
      outputId: 'result'
    });

    await expect(pagesService.bakeFile({
      pageId: page._id,
      path: 'exports/result.json',
      buffer: Buffer.from('conflict'),
      mimeType: 'text/plain',
      conflictPolicy: 'fail'
    }, memberOf(ORG_A))).rejects.toMatchObject({ statusCode: 409 });

    const second = await pagesService.bakeFile({
      pageId: page._id,
      path: 'exports/result.json',
      buffer: Buffer.from('{"value":2}'),
      mimeType: 'application/json',
      conflictPolicy: 'create-revision'
    }, memberOf(ORG_A));
    expect(second.file.revision).toBe(2);
    expect(second.file.history).toHaveLength(1);
    expect(second.file.history[0].fileId).toBe(first.file.fileId);
    expect(second.page.blocks.filter(block => block.kind === 'file')).toHaveLength(1);
  });

  it('creates a distinct logical path when the selected conflict policy requests it', async () => {
    const page = await pagesService.create({ name: 'Artifacts' }, memberOf(ORG_A));
    await pagesService.bakeFile({
      pageId: page._id,
      path: 'exports/result.json',
      buffer: Buffer.from('one'),
      mimeType: 'text/plain'
    }, memberOf(ORG_A));
    const result = await pagesService.bakeFile({
      pageId: page._id,
      path: 'exports/result.json',
      buffer: Buffer.from('two'),
      mimeType: 'text/plain',
      conflictPolicy: 'create-distinct-name'
    }, memberOf(ORG_A));
    expect(result.file.path).toBe('exports/result (2).json');
    expect(result.page.blocks.filter(block => block.kind === 'file')).toHaveLength(2);
  });

  it('retracts page-owned file blobs when their block or page is removed', async () => {
    const page = await pagesService.create({ name: 'Artifacts' }, memberOf(ORG_A));
    const baked = await pagesService.bakeFile({
      pageId: page._id,
      path: 'exports/remove-me.txt',
      buffer: Buffer.from('artifact'),
      mimeType: 'text/plain'
    }, memberOf(ORG_A));
    expect(await db.collection('files.files').countDocuments({ _id: new ObjectId(baked.file.fileId) })).toBe(1);

    await pagesService.update(page._id, { blocks: [], order: [] }, memberOf(ORG_A));
    expect(await db.collection('files.files').countDocuments({ _id: new ObjectId(baked.file.fileId) })).toBe(0);

    const next = await pagesService.bakeFile({
      pageId: page._id,
      path: 'exports/remove-page.txt',
      buffer: Buffer.from('artifact'),
      mimeType: 'text/plain'
    }, memberOf(ORG_A));
    await pagesService.remove(page._id, memberOf(ORG_A));
    expect(await db.collection('files.files').countDocuments({ _id: new ObjectId(next.file.fileId) })).toBe(0);
  });

  it('sequences page create, update, Bake, and delete mutations', async () => {
    const page = await pagesService.create({ name: 'Sequenced' }, memberOf(ORG_A));
    expect(await getOrganizationChangeSequence(ORG_A)).toBe(1);

    await pagesService.update(page._id, { name: 'Renamed' }, memberOf(ORG_A));
    expect(await getOrganizationChangeSequence(ORG_A)).toBe(2);

    await pagesService.bakeFile({
      pageId: page._id,
      path: 'exports/sequence.txt',
      buffer: Buffer.from('sequenced'),
      mimeType: 'text/plain'
    }, memberOf(ORG_A));
    expect(await getOrganizationChangeSequence(ORG_A)).toBe(3);

    await pagesService.remove(page._id, memberOf(ORG_A));
    expect(await getOrganizationChangeSequence(ORG_A)).toBe(4);
  });

  it('retracts a failed Bake revision and restores the prior page file', async () => {
    const page = await pagesService.create({ name: 'Rollback' }, memberOf(ORG_A));
    const first = await pagesService.bakeFile({
      pageId: page._id,
      path: 'exports/result.txt',
      buffer: Buffer.from('first'),
      mimeType: 'text/plain'
    }, memberOf(ORG_A));
    const second = await pagesService.bakeFile({
      pageId: page._id,
      path: 'exports/result.txt',
      buffer: Buffer.from('second'),
      mimeType: 'text/plain',
      conflictPolicy: 'create-revision'
    }, memberOf(ORG_A));

    const rollback = await pagesService.retractBakedFile({
      pageId: page._id,
      fileId: second.file.fileId
    }, memberOf(ORG_A));
    const restored = await pagesService.getById(page._id, memberOf(ORG_A));
    expect(rollback.success).toBe(true);
    expect(restored.blocks.find(block => block.kind === 'file').file.fileId).toBe(first.file.fileId);
    expect(await db.collection('files.files').countDocuments({ _id: new ObjectId(second.file.fileId) })).toBe(0);
  });

  it('refuses page file baking into a section and rejects unsafe paths', async () => {
    const section = await pagesService.create({ kind: 'section' }, memberOf(ORG_A));
    await expect(pagesService.bakeFile({
      pageId: section._id,
      path: 'result.txt',
      buffer: Buffer.from('value')
    }, memberOf(ORG_A))).rejects.toMatchObject({ statusCode: 400 });
    const page = await pagesService.create({}, memberOf(ORG_A));
    await expect(pagesService.bakeFile({
      pageId: page._id,
      path: '../result.txt',
      buffer: Buffer.from('value')
    }, memberOf(ORG_A))).rejects.toMatchObject({ statusCode: 400 });
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
