import { describe, expect, it, vi } from 'vitest';

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
vi.mock('../files/service.js', () => ({
  uploadFile: vi.fn(async (buffer, filename) => ({ id: `stored-${filename}`, filename, url: '#' })),
  deleteFile: vi.fn(async () => {})
}));
vi.mock('../entity-revisions/service.js', () => ({
  ensureForEntitySnapshot: vi.fn(async () => ({ _id: 'rev-1', data: { number: 1, contentHash: 'sha256:x' } }))
}));
vi.mock('../../core/access/service.js', () => ({
  hasEntityAccess: vi.fn(() => true)
}));
vi.mock('../cts-types/repository.js', () => ({
  findByTypeId: vi.fn(async (organizationId, typeId) => (
    typeId === 'panel'
      ? { id: 'panel', class: 'item', version: 2, fields: { serial: { base: 'string' }, width: { base: 'quantity', unit: 'mm' } }, states: { main: { initial: 'available' } } }
      : typeId === 'gallery'
        ? { id: 'gallery', class: 'file', version: 1, payload: { mime: ['image/*'], maxSize: 1024 }, fields: { name: { base: 'string' } } }
        : null
  )),
  listByOrganization: vi.fn(async () => [])
}));

import { instanceServiceResolver } from './service.js';
import * as repository from './repository.js';
import { findByTypeId } from '../cts-types/repository.js';

const db = { collection: vi.fn() };
const connectDB = (await import('~/server/db/mongo')).connectDB;
connectDB.mockResolvedValue(db);

function stubCollection() {
  const coll = { insertOne: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), find: vi.fn(), deleteOne: vi.fn() };
  coll.find.returnValues = [];
  coll.find.mockReturnValue({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) });
  db.collection.mockReturnValue(coll);
  return coll;
}

describe('generic instance service stored shape (SPEC §3)', () => {
  it('stores flat fields + states and projects the wire DTO', async () => {
    const coll = stubCollection();
    coll.findOneAndUpdate.mockResolvedValue(null); // create path ignores it; update test sets its own
    const service = instanceServiceResolver('cassette'); // pack type: static declaration, name row field

    const dto = await service.create(
      { identity: { name: 'My cassette' }, data: { name: 'My cassette' }, status: { state: { primary: 'draft' } }, lineage: {} },
      'user-1',
      'org-1'
    );

    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.type).toBe('cassette');
    expect(stored.fields).toEqual({ name: 'My cassette' });
    expect(stored.states).toEqual({ main: 'draft' });
    expect(stored.organizationId).toBe('org-1');
    expect(stored.lineage).toEqual({});
    expect(stored.identity).toBeUndefined();
    expect(stored.data).toBeUndefined();
    expect(stored.status).toBeUndefined();

    expect(dto).toMatchObject({
      type: 'cassette',
      identity: { name: 'My cassette' },
      status: { state: { primary: 'draft' } },
      data: { name: 'My cassette' }
    });
  });

  it('splits quantity fields into the specs slot on the wire for item classes', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel'); // org item: quantity -> specs slot

    const dto = await service.create(
      { data: { serial: 'SH-1' }, specs: { width: 2500 }, lineage: {} },
      'user-1',
      'org-1'
    );

    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.fields).toEqual({ serial: 'SH-1', width: 2500 });
    expect(dto.data).toEqual({ serial: 'SH-1' });
    expect(dto.specs).toEqual({ width: 2500 });
  });

  it('maps wire patch paths to §3 field writes', async () => {
    const coll = stubCollection();
    coll.findOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', type: 'cassette', typeVersion: 1, fields: { name: 'Renamed' }, states: { main: 'active' }, lineage: {} });
    const service = instanceServiceResolver('cassette');

    await service.processUpdate('507f1f77bcf86cd799439011', {
      data: { name: 'Renamed' },
      status: { state: { primary: 'active' } },
      lineage: { organizationId: 'org-1' }
    });

    const set = coll.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set['fields.name']).toBe('Renamed');
    expect(set['states.main']).toBe('active');
    // Tenancy is immutable after construct: the wire lineage projection's
    // organizationId key is not a writable edge.
    expect(set['lineage.organizationId']).toBeUndefined();
    expect(set.organizationId).toBeUndefined();
  });

  it('validates and stores the payload slot from either wire shape', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('cassette'); // mounted pack file type, raw payload traits

    const dto = await service.create(
      { payload: { fileId: 'file-1', mime: 'application/perigram+occs', size: 1024 } },
      'user-1',
      'org-1'
    );
    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.payload).toEqual({ fileId: 'file-1', mime: 'application/perigram+occs', size: 1024 });
    expect(dto.attachments.primary).toEqual({ fileId: 'file-1', mime: 'application/perigram+occs', size: 1024 });

    const legacy = await service.create(
      { attachments: { primary: { fileId: 'file-2', mime: 'application/perigram+occs' } } },
      'user-1',
      'org-1'
    );
    expect(legacy.attachments.primary.fileId).toBe('file-2');
  });

  it('accepts wildcard declared mime lists and enforces maxSize', async () => {
    stubCollection();
    const service = instanceServiceResolver('gallery'); // org file type: mime ['image/*'], maxSize 1024

    const dto = await service.create(
      { payload: { fileId: 'shot-1', mime: 'image/png', size: 100 } },
      'user-1',
      'org-1'
    );
    expect(dto.attachments.primary.mime).toBe('image/png');

    await expect(service.create({ payload: { fileId: 'big', mime: 'image/png', size: 2048 } }, 'user-1', 'org-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects payload references that violate the declared traits', async () => {
    stubCollection();
    const cassette = instanceServiceResolver('cassette');
    await expect(cassette.create({ payload: { fileId: 'f', mime: 'image/png' } }, 'user-1', 'org-1'))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(cassette.create({ payload: {} }, 'user-1', 'org-1'))
      .rejects.toMatchObject({ statusCode: 400 });

    const panel = instanceServiceResolver('panel'); // org item type without payload traits
    await expect(panel.create({ payload: { fileId: 'f', mime: 'image/png' } }, 'user-1', 'org-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('stores provenance verbatim and never patches it', async () => {
    const coll = stubCollection();
    coll.findOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', type: 'cassette', fields: {}, lineage: {} });
    const service = instanceServiceResolver('cassette');
    const provenance = { op: 'effect.createEntity:n1:bake', sources: [{ type: 'cassette', id: 'c-1' }], effective: { via: 'bake', targetState: 'READY' } };

    const dto = await service.create({ provenance }, 'user-1', 'org-1');
    expect(coll.insertOne.mock.calls[0][0].provenance).toEqual(provenance);
    expect(dto.provenance).toEqual(provenance);

    await service.processUpdate('507f1f77bcf86cd799439011', {
      provenance: { op: 'forged' },
      attachments: { primary: { fileId: 'evil' } }
    });
    const set = coll.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.provenance).toBeUndefined();
    expect(set.payload).toBeUndefined();
    expect(set['payload.fileId']).toBeUndefined();
  });

  it('processList resolves declarations through its context object (the route contract)', async () => {
    const coll = stubCollection();
    // Org-authored type: only resolvable when organizationId rides the
    // context object — the positional call shape 404'd org types.
    const service = instanceServiceResolver('panel');
    const items = await service.processList({}, { userId: 'user-1', organizationId: 'org-1' });
    expect(Array.isArray(items)).toBe(true);
    expect(coll.find.mock.calls[0][0].type).toBe('panel');
  });

  it('admits the system catalog beside org rows and serves pack types', async () => {
    const coll = stubCollection();
    // tech-drawing pack type resolves through the composed static map
    const pens = instanceServiceResolver('pen-template');
    await pens.list({}, 'user-1', 'org-1');
    const filter = coll.find.mock.calls[0][0];
    expect(filter.type).toBe('pen-template');
    expect(filter.$or).toEqual([
      { organizationId: 'org-1' },
      { organizationId: null }
    ]);
  });

  it('answers undeclared types with a clean 404, not a server fault', async () => {
    stubCollection();
    const service = instanceServiceResolver('mystery-thing');
    await expect(service.list({}, 'user-1', 'org-1')).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining('Unknown type mystery-thing')
    });
  });

  it('stores tenancy in the §3 slot and re-projects it onto the wire lineage', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('cassette');

    const dto = await service.create(
      { identity: { name: 'Scoped' }, lineage: { projectId: 'p-1', organizationId: 'org-1' } },
      'user-1',
      'org-1'
    );

    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.organizationId).toBe('org-1');
    expect(stored.lineage).toEqual({ projectId: 'p-1' });
    expect(dto.lineage).toEqual({ projectId: 'p-1', organizationId: 'org-1' });
  });
});

describe('payload replacement (the editor concern, SPEC §3)', () => {
  const SKETCH_ID = '507f1f77bcf86cd799439011';

  function stubSketchDoc(coll, overrides = {}) {
    coll.findOne.mockResolvedValue({
      _id: SKETCH_ID,
      type: 'sketch',
      typeVersion: 1,
      organizationId: 'org-1',
      name: 'Field sketch',
      fields: { name: 'Field sketch' },
      states: { main: 'CREATED' },
      lineage: {},
      ...overrides
    });
    coll.findOneAndUpdate.mockResolvedValue({
      _id: SKETCH_ID,
      type: 'sketch',
      typeVersion: 1,
      organizationId: 'org-1',
      fields: { name: 'Field sketch' },
      payload: { fileId: 'stored-scene.json', mime: 'application/json' },
      lineage: {}
    });
  }

  it('stores, revisions, and swaps the payload for a revisioned type', async () => {
    const coll = stubCollection();
    stubSketchDoc(coll);
    const service = instanceServiceResolver('sketch');

    const dto = await service.replacePayload(SKETCH_ID, {
      buffer: Buffer.from('{"version":1,"strokes":[]}'),
      filename: 'scene.json',
      mimeType: 'application/json'
    }, { userId: 'user-1', organizationId: 'org-1', auth: { userId: 'user-1', organizationId: 'org-1' } });

    const { uploadFile } = await import('../files/service.js');
    const { ensureForEntitySnapshot } = await import('../entity-revisions/service.js');
    expect(uploadFile).toHaveBeenCalledWith(expect.any(Buffer), 'scene.json', expect.objectContaining({ type: 'sketch' }), 'files');
    expect(ensureForEntitySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'sketch',
      scope: 'scene',
      reason: 'payload-replaced'
    }));
    const set = coll.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.payload).toMatchObject({ fileId: 'stored-scene.json', mime: 'application/json' });
    expect(dto.attachments.primary.fileId).toBe('stored-scene.json');
  });

  it('refuses types without a revision scope or payload traits', async () => {
    stubCollection();
    const facadeDesign = instanceServiceResolver('facade-design'); // payload, no revisions
    await expect(facadeDesign.replacePayload(SKETCH_ID, { buffer: Buffer.from('x'), filename: 'm.glb' }, {}))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('revision scope') });

    const pattern = instanceServiceResolver('facade-pattern'); // revisions absent, no payload
    await expect(pattern.replacePayload(SKETCH_ID, { buffer: Buffer.from('x'), filename: 'g.json' }, {}))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('declares no payload') });
  });

  it('enforces declared mime traits and the access gate', async () => {
    const coll = stubCollection();
    stubSketchDoc(coll);
    const service = instanceServiceResolver('sketch');

    await expect(service.replacePayload(SKETCH_ID, {
      buffer: Buffer.from('x'),
      filename: 'scene.png',
      mimeType: 'image/png'
    }, { userId: 'user-1', organizationId: 'org-1', auth: {} }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('not accepted') });

    const { hasEntityAccess } = await import('../../core/access/service.js');
    hasEntityAccess.mockReturnValueOnce(false);
    await expect(service.replacePayload(SKETCH_ID, {
      buffer: Buffer.from('{}'),
      filename: 'scene.json',
      mimeType: 'application/json'
    }, { userId: 'user-1', organizationId: 'org-1', auth: {} }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('cleans up the stored blob when the swap fails', async () => {
    const coll = stubCollection();
    stubSketchDoc(coll);
    coll.findOneAndUpdate.mockResolvedValue(null); // swap fails
    const service = instanceServiceResolver('sketch');

    await expect(service.replacePayload(SKETCH_ID, {
      buffer: Buffer.from('{}'),
      filename: 'scene.json',
      mimeType: 'application/json'
    }, { userId: 'user-1', organizationId: 'org-1', auth: {} }))
      .rejects.toThrow();
    const { deleteFile } = await import('../files/service.js');
    expect(deleteFile).toHaveBeenCalledWith('stored-scene.json', 'files');
  });

  it('enforces payload creation protocols on the construct handlers', async () => {
    const coll = stubCollection();
    const image = instanceServiceResolver('image'); // documents pack: upload + capture

    await expect(image.constructionHandlers.capture({ data: { name: 'Shot' } }, { userId: 'u-1', organizationId: 'org-1' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('requires a payload file') });

    const shot = await image.constructionHandlers.upload(
      { identity: { name: 'Shot' }, payload: { fileId: 'img-1', mime: 'image/png', size: 2048 } },
      { userId: 'u-1', organizationId: 'org-1' }
    );
    expect(shot.type).toBe('image');
    expect(coll.insertOne.mock.calls[0][0].payload).toMatchObject({ fileId: 'img-1', mime: 'image/png' });

    const sketch = instanceServiceResolver('sketch'); // editor protocol: blank-first-save
    const blank = await sketch.constructionHandlers.editor({ identity: { name: 'Field notes' } }, { userId: 'u-1', organizationId: 'org-1' });
    expect(blank.type).toBe('sketch');
    expect(blank.attachments).toBeUndefined();
  });
});
