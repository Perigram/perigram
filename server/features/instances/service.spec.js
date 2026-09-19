import { describe, expect, it, vi } from 'vitest';

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
vi.mock('../cts-types/repository.js', () => ({
  findByTypeId: vi.fn(async (organizationId, typeId) => (
    typeId === 'panel'
      ? { id: 'panel', class: 'item', version: 2, fields: { serial: { base: 'string' }, width: { base: 'quantity', unit: 'mm' } }, states: { main: { initial: 'available' } } }
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
    expect(set['lineage.organizationId']).toBe('org-1');
  });
});
