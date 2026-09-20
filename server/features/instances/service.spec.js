import { describe, expect, it, vi } from 'vitest';

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
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
