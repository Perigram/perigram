import { describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
vi.mock('../files/service.js', () => ({
  uploadFile: vi.fn(async (buffer, filename) => ({ id: `stored-${filename}`, filename, url: '#' })),
  deleteFile: vi.fn(async () => {})
}));
vi.mock('../instance-revisions/service.js', () => ({
  ensureForEntitySnapshot: vi.fn(async () => ({ _id: 'rev-1', data: { number: 1, contentHash: 'sha256:x' } }))
}));
vi.mock('../../core/access/service.js', () => ({
  hasInstanceAccess: vi.fn(() => true)
}));
vi.mock('../plugins/repository.js', () => ({
  listDeclarationsByOrganization: vi.fn(async () => []),
  findDeclarationByTypeId: vi.fn(async () => null)
}));
vi.mock('../workflow-overrides/service.js', () => ({
  resolveActiveWorkflow: vi.fn(async () => null)
}));
vi.mock('../cts-types/repository.js', () => ({
  findByTypeId: vi.fn(async (organizationId, typeId) => (
    typeId === 'panel'
      ? {
        id: 'panel',
        class: 'item',
        version: 2,
        fields: { serial: { base: 'string' }, width: { base: 'quantity', unit: 'mm' } },
        states: {
          main: { initial: 'available', states: { available: {}, installed: { terminal: true } } },
          quality: { initial: 'unchecked', states: { unchecked: {}, passed: {} } }
        }
      }
      : typeId === 'gallery'
        ? { id: 'gallery', class: 'file', version: 1, payload: { mime: ['image/*'], maxSize: 1024 }, fields: { name: { base: 'string' } } }
        : typeId === 'label'
        ? { id: 'label', class: 'item', version: 1, fields: { code: { base: 'string', identifier: true }, note: { base: 'string' } }, states: { main: { initial: 'new', states: { new: {} } } } }
        : typeId === 'memo'
          ? { id: 'memo', class: 'item', version: 1, fields: { title: { base: 'string' }, body: { base: 'string' } }, states: { main: { initial: 'new', states: { new: {} } } }, access: { inherits: 'gallery' } }
        : typeId === 'plain-note'
          ? { id: 'plain-note', class: 'item', version: 1, fields: { name: { base: 'string', identifier: true } }, states: { main: { initial: 'new', states: { new: {} } } } }
          : null
  )),
  // org-1 declares the panel-under-bin hierarchy (SPEC §6 children edge,
  // no authored lineageKey -> stamped 'binId' at edge normalize)
  listByOrganization: vi.fn(async (organizationId) => (
    organizationId === 'org-1'
      ? [{ id: 'bin', class: 'group', version: 1, fields: { name: { base: 'string' } }, edges: { children: { panels: { types: ['panel'], onRemove: 'restrict' } } } }]
      : []
  ))
}));

import { instanceServiceResolver } from './service.js';
import * as repository from './repository.js';
import { findByTypeId } from '../cts-types/repository.js';
import { resolveActiveWorkflow } from '../workflow-overrides/service.js';
import * as pluginInstalls from '../plugins/repository.js';
import documentsListing from '../../../workers/documents/listing.json' with { type: 'json' };
const documentsByType = new Map(documentsListing.declarations.types.map(type => [type.id, type]));
pluginInstalls.findDeclarationByTypeId.mockImplementation(async (organizationId, typeId) => documentsByType.get(typeId) || null);

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
  it('stores flat fields + state and projects the wire DTO', async () => {
    const coll = stubCollection();
    coll.findOneAndUpdate.mockResolvedValue(null); // create path ignores it; update test sets its own
    const service = instanceServiceResolver('pdf-document'); // documents pack file type: static declaration, name row field

    const dto = await service.create(
      { name: 'My cassette', fields: { name: 'My cassette' }, state: 'draft', lineage: {} },
      'user-1',
      'org-1'
    );

    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.type).toBe('pdf-document');
    expect(stored.fields).toEqual({ name: 'My cassette' });
    expect(stored.state).toBe('draft');
    expect(stored.organizationId).toBe('org-1');
    expect(stored.lineage).toEqual({});
    expect(stored.identity).toBeUndefined();
    expect(stored.data).toBeUndefined();
    expect(stored.status).toBeUndefined();

    expect(dto).toMatchObject({
      type: 'pdf-document',
      name: 'My cassette',
      state: 'draft',
      fields: { name: 'My cassette' }
    });
  });

  it('keeps rows flat on the wire — no slot split (owner decision 2026-10-11)', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel'); // org item with a quantity row

    const dto = await service.create(
      { fields: { serial: 'SH-1', width: 2500 }, lineage: {} },
      'user-1',
      'org-1'
    );

    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.fields).toEqual({ serial: 'SH-1', width: 2500 });
    expect(dto.fields).toEqual({ serial: 'SH-1', width: 2500 });
    expect(dto.data).toBeUndefined();
    expect(dto.specs).toBeUndefined();
  });

  it('creates without a state — nothing synthesizes an initial (SPEC §7)', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');

    const dto = await service.create({ fields: { serial: 'AX-1' }, lineage: {} }, 'user-1', 'org-1');

    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.state).toBeNull();
    expect(dto.state).toBeNull();
  });

  it('refuses direct lifecycle writes outside the status runtime', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');

    await expect(service.processUpdate('507f1f77bcf86cd799439011', {
      fields: { serial: 'AX-2' },
      state: 'passed'
    }, 'org-1')).rejects.toThrow(/status runtime/);
    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('locks row-field writes outside the current state field policy (SPEC §7)', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');
    resolveActiveWorkflow.mockResolvedValueOnce({
      primaryRegion: 'main',
      states: {
        available: { fieldPolicy: { visible: ['serial', 'width'], editable: ['width'] } },
        installed: {}
      },
      regions: { main: { initial: 'available', states: { available: { fieldPolicy: { visible: ['serial', 'width'], editable: ['width'] } }, installed: {} }, transitions: [] } }
    });
    coll.findOne.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', type: 'panel', state: 'available', fields: {} });

    await expect(service.processUpdate('507f1f77bcf86cd799439011', {
      fields: { serial: 'AX-2' }
    }, 'org-1')).rejects.toThrow(/serial.*locked in state available/);
    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();

    await service.processUpdate('507f1f77bcf86cd799439011', {
      fields: { width: 1800 }
    }, 'org-1');
    expect(coll.findOneAndUpdate).toHaveBeenCalled();
  });

  it('writes unrestricted when no state carries a field policy', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');
    resolveActiveWorkflow.mockResolvedValueOnce({
      primaryRegion: 'main',
      states: { available: {} },
      regions: { main: { initial: 'available', states: { available: {} }, transitions: [] } }
    });

    await service.processUpdate('507f1f77bcf86cd799439011', {
      fields: { serial: 'AX-3' }
    }, 'org-1');

    // The unrestricted fast path reads no instance document.
    expect(coll.findOne).not.toHaveBeenCalled();
    expect(coll.findOneAndUpdate).toHaveBeenCalled();
  });

  it('maps wire patch paths to §3 field writes', async () => {
    const coll = stubCollection();
    coll.findOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', type: 'pdf-document', typeVersion: 1, fields: { name: 'Renamed' }, states: { main: 'active' }, lineage: {} });
    const service = instanceServiceResolver('pdf-document');

    await service.processUpdate('507f1f77bcf86cd799439011', {
      fields: { name: 'Renamed' },
      name: 'Renamed Too'
    }, 'org-1');

    const set = coll.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set['fields.name']).toBe('Renamed');
    expect(set.name).toBe('Renamed Too');
    expect(set['states.main']).toBeUndefined();
    expect(set.organizationId).toBeUndefined();
  });

  it('validates and stores the payload slot from either wire shape', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('pdf-document'); // documents pack file type, raw payload traits

    const dto = await service.create(
      { payload: { fileId: 'file-1', mime: 'application/pdf', size: 1024 } },
      'user-1',
      'org-1'
    );
    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.payload).toEqual({ fileId: 'file-1', mime: 'application/pdf', size: 1024 });
    expect(dto.payload).toEqual({ fileId: 'file-1', mime: 'application/pdf', size: 1024 });
    expect(dto.attachments).toBeUndefined();
  });

  it('accepts wildcard declared mime lists and enforces maxSize', async () => {
    stubCollection();
    const service = instanceServiceResolver('gallery'); // org file type: mime ['image/*'], maxSize 1024

    const dto = await service.create(
      { payload: { fileId: 'shot-1', mime: 'image/png', size: 100 } },
      'user-1',
      'org-1'
    );
    expect(dto.payload.mime).toBe('image/png');

    await expect(service.create({ payload: { fileId: 'big', mime: 'image/png', size: 2048 } }, 'user-1', 'org-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects payload references that violate the declared traits', async () => {
    stubCollection();
    const cassette = instanceServiceResolver('pdf-document');
    await expect(cassette.create({ payload: { fileId: 'f', mime: 'text/plain' } }, 'user-1', 'org-1'))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(cassette.create({ payload: {} }, 'user-1', 'org-1'))
      .rejects.toMatchObject({ statusCode: 400 });

    const panel = instanceServiceResolver('panel'); // org item type without payload traits
    await expect(panel.create({ payload: { fileId: 'f', mime: 'text/plain' } }, 'user-1', 'org-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('stores provenance verbatim and never patches it', async () => {
    const coll = stubCollection();
    coll.findOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', type: 'pdf-document', fields: {}, lineage: {} });
    const service = instanceServiceResolver('pdf-document');
    const provenance = { op: 'effect.createEntity:n1:bake', sources: [{ type: 'pdf-document', id: 'c-1' }], effective: { via: 'bake', targetState: 'READY' } };

    const dto = await service.create({ provenance }, 'user-1', 'org-1');
    expect(coll.insertOne.mock.calls[0][0].provenance).toEqual(provenance);
    expect(dto.provenance).toEqual(provenance);

    await service.processUpdate('507f1f77bcf86cd799439011', {
      provenance: { op: 'forged' },
      attachments: { primary: { fileId: 'evil' } }
    }, 'org-1');
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
    // documents pack type resolves through the composed static map
    const documents = instanceServiceResolver('text-document');
    await documents.list({}, 'user-1', 'org-1');
    const filter = coll.find.mock.calls[0][0];
    expect(filter.type).toBe('text-document');
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
    const service = instanceServiceResolver('pdf-document');

    const dto = await service.create(
      { name: 'Scoped', lineage: { projectId: 'p-1' } },
      'user-1',
      'org-1'
    );

    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.organizationId).toBe('org-1');
    expect(stored.lineage).toEqual({ projectId: 'p-1' });
    expect(dto.organizationId).toBe('org-1');
    expect(dto.lineage).toEqual({ projectId: 'p-1' });
  });

  it('createForHttp stores the §3 draft under the access gate and refuses without a grant', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('label'); // item class

    const dto = await service.createForHttp(
      { name: 'Hanger 40x20', fields: { code: 'H40', note: 'n' } },
      { auth: { userId: 'user-1', organizationId: 'org-1' }, organizationId: 'org-1' }
    );

    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.organizationId).toBe('org-1');
    expect(stored.name).toBe('Hanger 40x20');
    expect(stored.fields).toEqual({ code: 'H40', note: 'n' });
    expect(dto.name).toBe('Hanger 40x20');

    const { hasInstanceAccess } = await import('../../core/access/service.js');
    hasInstanceAccess.mockReturnValueOnce(false);
    await expect(service.createForHttp(
      { name: 'Nope', fields: {} },
      { auth: {}, organizationId: 'org-1' }
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it('a type delegating its write gate (access.inherits) is authorized by the parent grant', async () => {
    stubCollection();
    const { hasInstanceAccess } = await import('../../core/access/service.js');
    const service = instanceServiceResolver('memo'); // item class, inherits gallery (file class)

    await service.createForHttp(
      { name: 'Composed', fields: { title: 't' } },
      { auth: {}, organizationId: 'org-1' }
    );

    // The gate asked for the PARENT's grant (files feature, gallery type),
    // not memo's own class collection — inheritance across classes.
    expect(hasInstanceAccess).toHaveBeenLastCalledWith(
      expect.objectContaining({ typeId: 'gallery', feature: 'files', level: 'write' })
    );
  });
});

describe('generic instance list filters (compiled screen source contract)', () => {
  // The compiled child-region source speaks the bare lineageKey convention
  // (`binId: '$screen.scope.instanceId'` resolved to the parent id): the
  // generic transport must scope the read by the declared edge's storage
  // path, exactly like the feature routes (cassettes' libraryId).
  it('scopes list reads by declared children-edge lineage keys', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');

    await service.list({ binId: 'bin-1' }, 'user-1', 'org-1');

    const filter = coll.find.mock.calls[0][0];
    expect(filter.type).toBe('panel');
    expect(filter['lineage.binId']).toBe('bin-1');
  });

  it('matches both stored id forms for ObjectId-shaped lineage values', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');
    const objectId = '507f1f77bcf86cd799439011';

    await service.list({ binId: objectId }, 'user-1', 'org-1');

    const match = coll.find.mock.calls[0][0]['lineage.binId'];
    expect(match.$in.map(String)).toEqual([objectId, objectId]);
  });

  it('admits declared lineage keys from org declarations for org-served types', async () => {
    const coll = stubCollection();
    // org-2 declares nothing: a key org-1 declared must not leak scope
    // into another organization's reads (the derivation is per-org).
    const service = instanceServiceResolver('panel');

    await service.list({ binId: 'bin-1' }, 'user-1', 'org-2');

    expect(coll.find.mock.calls[0][0]['lineage.binId']).toBeUndefined();
  });

  it('applies primary status windows the compiled sources emit', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');

    await service.list({ primaryState: 'available' }, 'user-1', 'org-1');
    expect(coll.find.mock.calls[0][0].state).toBe('available');

    await service.list({ primaryStates: 'available,installed' }, 'user-1', 'org-1');
    expect(coll.find.mock.calls[1][0].state).toEqual({ $in: ['available', 'installed'] });
  });

  it('resolves _id reference lookups server-side', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');

    await service.list({ _id: '507f1f77bcf86cd799439011' }, 'user-1', 'org-1');

    expect(coll.find.mock.calls[0][0]._id).toEqual(new ObjectId('507f1f77bcf86cd799439011'));
  });

  it('ignores filter keys the type never declared', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');

    await service.list({ binId: 'bin-1', mysteryId: 'nope' }, 'user-1', 'org-1');

    const filter = coll.find.mock.calls[0][0];
    expect(filter.mysteryId).toBeUndefined();
    expect(filter['lineage.mysteryId']).toBeUndefined();
    expect(filter['lineage.binId']).toBe('bin-1');
  });
});

describe('payload replacement (the editor concern, SPEC §3)', () => {
  const SKETCH_ID = '507f1f77bcf86cd799439011';

  function stubSketchDoc(coll, overrides = {}) {
    coll.findOne.mockResolvedValue({
      _id: SKETCH_ID,
      type: 'csv-table',
      typeVersion: 1,
      organizationId: 'org-1',
      name: 'Field table',
      fields: { name: 'Field table' },
      states: { main: 'CREATED' },
      lineage: {},
      ...overrides
    });
    coll.findOneAndUpdate.mockResolvedValue({
      _id: SKETCH_ID,
      type: 'csv-table',
      typeVersion: 1,
      organizationId: 'org-1',
      fields: { name: 'Field table' },
      payload: { fileId: 'stored-table.csv', mime: 'text/csv' },
      lineage: {}
    });
  }

  it('stores, revisions, and swaps the payload for a revisioned type', async () => {
    const coll = stubCollection();
    stubSketchDoc(coll);
    const service = instanceServiceResolver('csv-table');

    const dto = await service.replacePayload(SKETCH_ID, {
      buffer: Buffer.from('a,b\n1,2'),
      filename: 'table.csv',
      mimeType: 'text/csv'
    }, { userId: 'user-1', organizationId: 'org-1', auth: { userId: 'user-1', organizationId: 'org-1' } });

    const { uploadFile } = await import('../files/service.js');
    const { ensureForEntitySnapshot } = await import('../instance-revisions/service.js');
    expect(uploadFile).toHaveBeenCalledWith(expect.any(Buffer), 'table.csv', expect.objectContaining({ type: 'csv-table' }), 'files');
    expect(ensureForEntitySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      typeId: 'csv-table',
      scope: 'content',
      reason: 'payload-replaced'
    }));
    const set = coll.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.payload).toMatchObject({ fileId: 'stored-table.csv', mime: 'text/csv' });
    expect(dto.payload.fileId).toBe('stored-table.csv');
  });

  it('refuses types without a revision scope or payload traits', async () => {
    stubCollection();
    const docx = instanceServiceResolver('docx-document'); // payload, no revisions
    await expect(docx.replacePayload(SKETCH_ID, { buffer: Buffer.from('x'), filename: 'm.docx' }, { organizationId: 'org-1' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('revision scope') });

    const note = instanceServiceResolver('plain-note'); // revisions absent, no payload (org-store fixture)
    await expect(note.replacePayload(SKETCH_ID, { buffer: Buffer.from('x'), filename: 'g.json' }, { organizationId: 'org-1' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('declares no payload') });
  });

  it('enforces declared mime traits and the access gate', async () => {
    const coll = stubCollection();
    stubSketchDoc(coll);
    const service = instanceServiceResolver('csv-table');

    await expect(service.replacePayload(SKETCH_ID, {
      buffer: Buffer.from('x'),
      filename: 'scene.png',
      mimeType: 'image/png'
    }, { userId: 'user-1', organizationId: 'org-1', auth: {} }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('not accepted') });

    const { hasInstanceAccess } = await import('../../core/access/service.js');
    hasInstanceAccess.mockReturnValueOnce(false);
    await expect(service.replacePayload(SKETCH_ID, {
      buffer: Buffer.from('a,b'),
      filename: 'table.csv',
      mimeType: 'text/csv'
    }, { userId: 'user-1', organizationId: 'org-1', auth: {} }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('cleans up the stored blob when the swap fails', async () => {
    const coll = stubCollection();
    stubSketchDoc(coll);
    coll.findOneAndUpdate.mockResolvedValue(null); // swap fails
    const service = instanceServiceResolver('csv-table');

    await expect(service.replacePayload(SKETCH_ID, {
      buffer: Buffer.from('a,b'),
      filename: 'table.csv',
      mimeType: 'text/csv'
    }, { userId: 'user-1', organizationId: 'org-1', auth: {} }))
      .rejects.toThrow();
    const { deleteFile } = await import('../files/service.js');
    expect(deleteFile).toHaveBeenCalledWith('stored-table.csv', 'files');
  });

  it('enforces payload creation protocols on the construct handlers', async () => {
    const coll = stubCollection();
    const image = instanceServiceResolver('image'); // documents pack: upload + capture

    await expect(image.constructionHandlers.capture({ data: { name: 'Shot' } }, { userId: 'u-1', organizationId: 'org-1' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('requires a payload file') });

    const shot = await image.constructionHandlers.upload(
      { identity: { name: 'Shot' }, payload: { fileId: 'img-1', mime: 'image/jpeg', size: 2048 } },
      { userId: 'u-1', organizationId: 'org-1' }
    );
    expect(shot.type).toBe('image');
    expect(coll.insertOne.mock.calls[0][0].payload).toMatchObject({ fileId: 'img-1', mime: 'image/jpeg' });

    const table = instanceServiceResolver('csv-table'); // editor protocol: blank-first-save
    const blank = await table.constructionHandlers.editor({ identity: { name: 'Field notes' } }, { userId: 'u-1', organizationId: 'org-1' });
    expect(blank.type).toBe('csv-table');
    expect(blank.attachments).toBeUndefined();
  });

  it('constructs content-protocol documents: the wired text becomes the payload', async () => {
    const coll = stubCollection();
    const text = instanceServiceResolver('text-document');

    await expect(text.constructionHandlers.content({ name: 'Report' }, { userId: 'u-1', organizationId: 'org-1' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('requires a text body') });

    const { uploadFile } = await import('../files/service.js');
    const doc = await text.constructionHandlers.content(
      { name: 'Report', content: '# Hello' },
      { userId: 'u-1', organizationId: 'org-1' }
    );
    expect(uploadFile).toHaveBeenCalledWith(expect.any(Buffer), 'Report.md', expect.objectContaining({ type: 'text-document' }), 'files');
    expect(doc.type).toBe('text-document');
    expect(coll.insertOne.mock.calls[0][0].payload).toMatchObject({
      fileId: 'stored-Report.md',
      mime: 'text/markdown',
      size: Buffer.byteLength('# Hello')
    });
  });

  describe('naming (SPEC §4 + wire decision 2026-10-11)', () => {
    it('keeps the identifier row in fields — nothing copies row data into a second wire field', async () => {
      const coll = stubCollection();
      const service = instanceServiceResolver('label'); // code is flagged identifier

      const dto = await service.create({ fields: { code: 'LB-42', note: 'first' }, lineage: {} }, 'user-1', 'org-1');

      const stored = coll.insertOne.mock.calls[0][0];
      expect(stored.name).toBeNull();
      expect(dto.name).toBeNull();
      expect(dto.fields).toEqual({ code: 'LB-42', note: 'first' });
      // Display resolution is the client display contract's job: the
      // identifier row's value renders through titleFor, never a wire
      // synthesis.
    });

    it('stores an explicit wire rename in the name slot', async () => {
      const coll = stubCollection();
      const service = instanceServiceResolver('label');

      const dto = await service.create({ name: 'Custom title', fields: { code: 'LB-1' }, lineage: {} }, 'user-1', 'org-1');

      expect(coll.insertOne.mock.calls[0][0].name).toBe('Custom title');
      expect(dto.name).toBe('Custom title');
    });
  });
});
