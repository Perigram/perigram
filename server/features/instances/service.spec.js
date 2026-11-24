import { describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));
vi.mock('../files/service.js', () => ({
  uploadFile: vi.fn(async (buffer, filename) => ({ id: `stored-${filename}`, filename, url: '#' })),
  deleteFile: vi.fn(async () => {}),
  getFileBuffer: vi.fn(async () => Buffer.from('%PDF-1.4 frozen'))
}));
vi.mock('../instance-revisions/service.js', () => ({
  ensureForEntitySnapshot: vi.fn(async () => ({ _id: 'rev-1', data: { number: 1, contentHash: 'sha256:x' } })),
  getById: vi.fn(async () => null),
  pinnedRevisionFile: vi.fn(async () => null)
}));
vi.mock('../../core/access/service.js', () => ({
  hasInstanceAccess: vi.fn(() => true)
}));
vi.mock('../plugins/repository.js', () => ({
  listDeclarationsByOrganization: vi.fn(async () => []),
  findDeclarationByTypeId: vi.fn(async () => null),
  findInstall: vi.fn(async () => null)
}));
vi.mock('../workflow-overrides/service.js', () => ({
  resolveActiveWorkflow: vi.fn(async () => null)
}));
vi.mock('./organization-sequence.js', () => ({
  getOrganizationChangeSequence: vi.fn(async () => 0),
  recordOrganizationChange: vi.fn(async () => 1),
  runOrganizationChange: vi.fn(async (_organizationId, _metadata, mutate) => await mutate()),
  withOrganizationChangeSequence: vi.fn()
}));
vi.mock('../instance-events/service.js', () => ({
  publishEntityChanged: vi.fn(async () => null)
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
          : typeId === 'invoice'
        ? { id: 'invoice', class: 'item', version: 1, fields: { code: { base: 'string', identifier: true }, amount: { base: 'number' } } }
        : typeId === 'constrained-account'
          ? {
              id: 'constrained-account',
              class: 'item',
              version: 1,
              fields: {
                code: { base: 'string', identifier: true },
                invoices: { base: 'list', itemType: { base: 'ref', accepts: ['invoice'] } }
              },
              constraints: [{
                id: 'positive-invoice-total',
                message: 'Invoice total must be positive',
                expression: {
                  op: 'gt',
                  args: [
                    { op: 'sum', list: { op: 'related', key: 'invoices' }, var: 'invoice', body: { op: 'field', of: { op: 'var', name: 'invoice' }, path: ['amount'] } },
                    { op: 'lit', value: 0 }
                  ]
                }
              }]
            }
        : typeId === 'project'
            ? {
                id: 'project',
                class: 'group',
                version: 1,
                fields: { name: { base: 'string' }, library: { base: 'ref', accepts: ['panel'] } },
                edges: { relations: { panels: { types: ['panel'], cardinality: 'many', onRemove: 'detach', where: {
                  op: 'eq',
                  args: [
                    { op: 'field', of: { op: 'var', name: 'value' }, path: ['fields', 'serial'] },
                    { op: 'lit', value: 'ALLOWED' }
                  ]
                } } } }
              }
            : null
  )),
  // org-1 declares the panel-under-bin hierarchy (SPEC §6 children edge,
  // no authored lineageKey -> stamped 'binId' at edge normalize) and the
  // project relation owner (an explicit edge and a ref field over panel)
  listByOrganization: vi.fn(async (organizationId) => (
    organizationId === 'org-1'
      ? [
          { id: 'bin', class: 'group', version: 1, fields: { name: { base: 'string' } }, edges: { children: { panels: { types: ['panel', 'label'], onRemove: 'restrict' } } } },
          { id: 'invoice', class: 'item', version: 1, fields: { code: { base: 'string', identifier: true }, amount: { base: 'number' } } },
          {
            id: 'constrained-account',
            class: 'item',
            version: 1,
            fields: {
              code: { base: 'string', identifier: true },
              invoices: { base: 'list', itemType: { base: 'ref', accepts: ['invoice'] } }
            },
            constraints: [{
              id: 'positive-invoice-total',
              message: 'Invoice total must be positive',
              expression: {
                op: 'gt',
                args: [
                  { op: 'sum', list: { op: 'related', key: 'invoices' }, var: 'invoice', body: { op: 'field', of: { op: 'var', name: 'invoice' }, path: ['amount'] } },
                  { op: 'lit', value: 0 }
                ]
              }
            }]
          },
          {
            id: 'project',
            class: 'group',
            version: 1,
            fields: { name: { base: 'string' }, library: { base: 'ref', accepts: ['panel'] } },
            edges: { relations: { panels: { types: ['panel'], cardinality: 'many', onRemove: 'detach', where: {
                  op: 'eq',
                  args: [
                    { op: 'field', of: { op: 'var', name: 'value' }, path: ['fields', 'serial'] },
                    { op: 'lit', value: 'ALLOWED' }
                  ]
                } } } }
          }
        ]
      : []
  ))
}));

import { instanceServiceResolver, invalidateInstanceDeclarations } from './service.js';
import * as revisionService from '../instance-revisions/service.js';
import * as pluginsService from '../plugins/service.js';
import { runOrganizationChange } from './organization-sequence.js';
import * as repository from './repository.js';
import { findByTypeId } from '../cts-types/repository.js';
import { resolveActiveWorkflow } from '../workflow-overrides/service.js';
import * as pluginInstalls from '../plugins/repository.js';
import documentsListing from '../../../workers/documents/listing.json' with { type: 'json' };
const documentsByType = new Map(documentsListing.declarations.types.map(type => [type.id, type]));
pluginInstalls.findDeclarationByTypeId.mockImplementation(async (organizationId, typeId) => documentsByType.get(typeId) || null);

const transactionSession = {
  withTransaction: vi.fn(async callback => await callback()),
  endSession: vi.fn(async () => {})
};
const db = {
  collection: vi.fn(),
  client: { startSession: () => transactionSession }
};
const connectDB = (await import('~/server/db/mongo')).connectDB;
connectDB.mockResolvedValue(db);

function stubCollection() {
  const coll = { insertOne: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), find: vi.fn(), deleteOne: vi.fn() };
  coll.find.returnValues = [];
  coll.find.mockReturnValue({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) });
  db.collection.mockReturnValue(coll);
  return coll;
}

describe('authorized relation linking', () => {
  it('links a declared typed relation only after validating the target domain and owner revision', async () => {
    const coll = stubCollection();
    const owner = {
      _id: 'project-1',
      type: 'project',
      organizationId: 'org-1',
      revision: 1,
      updatedAt: '2026-11-17T06:00:00.000Z',
      fields: { name: 'Project' },
      relations: {}
    };
    const target = {
      _id: 'panel-1',
      type: 'panel',
      organizationId: 'org-1',
      revision: 1,
      updatedAt: '2026-11-17T06:00:00.000Z',
      fields: { serial: 'ALLOWED', width: { value: 20, unit: 'mm' } }
    };
    coll.findOne.mockImplementation(async filter => filter.type === 'project' ? owner : filter.type === 'panel' ? target : null);
    coll.findOneAndUpdate.mockResolvedValue({
      ...owner,
      revision: 2,
      relations: { panels: [{ type: 'panel', id: 'panel-1' }] }
    });
    const service = instanceServiceResolver('project');
    const session = { id: 'relation-link-session' };
    const sequence = await import('./organization-sequence.js');

    const updated = await service.linkRelationForHttp('project-1', 'panels', {
      type: 'panel',
      id: 'panel-1'
    }, {
      auth: { userId: 'user-1', organizationId: 'org-1' },
      organizationId: 'org-1',
      expectedRevision: '1',
      session
    });

    expect(updated.relations.panels).toEqual([{ type: 'panel', id: 'panel-1' }]);
    expect(sequence.getOrganizationChangeSequence).toHaveBeenCalledWith('org-1');
    expect(sequence.runOrganizationChange).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ kind: 'instance-updated' }),
      expect.any(Function),
      { session, expectedSequence: 0 }
    );
    expect(coll.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'project-1', updatedAt: owner.updatedAt }),
      expect.objectContaining({ $set: expect.objectContaining({ 'relations.panels': [{ type: 'panel', id: 'panel-1' }] }) }),
      expect.any(Object)
    );
  });

  it('unlinks one member from a declared many relation without bypassing target validation', async () => {
    const coll = stubCollection();
    const owner = {
      _id: 'project-1',
      type: 'project',
      organizationId: 'org-1',
      revision: 1,
      updatedAt: '2026-11-17T06:00:00.000Z',
      fields: { name: 'Project' },
      relations: { panels: [{ type: 'panel', id: 'panel-1' }, { type: 'panel', id: 'panel-2' }] }
    };
    const remainingTarget = {
      _id: 'panel-2',
      type: 'panel',
      organizationId: 'org-1',
      revision: 1,
      updatedAt: '2026-11-17T06:00:00.000Z',
      fields: { serial: 'ALLOWED', width: { value: 20, unit: 'mm' } }
    };
    coll.findOne.mockImplementation(async filter => filter.type === 'project'
      ? owner
      : filter.type === 'panel' && String(filter._id) === 'panel-2' ? remainingTarget : null);
    coll.findOneAndUpdate.mockResolvedValue({
      ...owner,
      revision: 2,
      relations: { panels: [{ type: 'panel', id: 'panel-2' }] }
    });
    const service = instanceServiceResolver('project');
    const session = { id: 'relation-unlink-session' };

    const updated = await service.unlinkRelationForHttp('project-1', 'panels', {
      type: 'panel',
      id: 'panel-1'
    }, {
      auth: { userId: 'user-1', organizationId: 'org-1' },
      organizationId: 'org-1',
      expectedRevision: '1',
      expectedOrganizationSequence: 10,
      session
    });

    expect(updated.relations.panels).toEqual([{ type: 'panel', id: 'panel-2' }]);
    expect(coll.findOneAndUpdate.mock.calls[0][2]).toEqual(expect.objectContaining({ session }));
    const { runOrganizationChange } = await import('./organization-sequence.js');
    expect(runOrganizationChange).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ kind: 'instance-updated' }),
      expect.any(Function),
      { session, expectedSequence: 10 }
    );
    expect(coll.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'project-1', updatedAt: owner.updatedAt }),
      expect.objectContaining({ $set: expect.objectContaining({
        'relations.panels': [{ type: 'panel', id: 'panel-2' }]
      }) }),
      expect.any(Object)
    );
  });

  it('rejects relation targets outside the declared where domain without writing', async () => {
    const coll = stubCollection();
    const owner = {
      _id: 'project-1',
      type: 'project',
      organizationId: 'org-1',
      revision: 1,
      updatedAt: '2026-11-17T06:00:00.000Z',
      fields: { name: 'Project' },
      relations: {}
    };
    const target = {
      _id: 'panel-1',
      type: 'panel',
      organizationId: 'org-1',
      revision: 1,
      updatedAt: '2026-11-17T06:00:00.000Z',
      fields: { serial: 'DENIED', width: { value: 20, unit: 'mm' } }
    };
    coll.findOne.mockImplementation(async filter => filter.type === 'project' ? owner : filter.type === 'panel' ? target : null);
    const service = instanceServiceResolver('project');

    await expect(service.linkRelationForHttp('project-1', 'panels', {
      type: 'panel',
      id: 'panel-1'
    }, {
      auth: { userId: 'user-1', organizationId: 'org-1' },
      organizationId: 'org-1',
      expectedRevision: '1'
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

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

  it('validates relation cardinality and accepted target types before create', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('project');

    await expect(service.create({
      relations: { panels: { type: 'panel', id: 'panel-1' } }
    }, 'user-1', 'org-1')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.create({
      relations: { panels: [{ type: 'invoice', id: 'invoice-1' }] }
    }, 'user-1', 'org-1')).rejects.toMatchObject({ statusCode: 400 });

    expect(coll.insertOne).not.toHaveBeenCalled();
  });

  it('rejects duplicate references in a declared relation list', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: 'panel-1',
      type: 'panel',
      typeVersion: 2,
      organizationId: 'org-1',
      fields: { serial: 'ALLOWED' },
      lineage: {},
      relations: {}
    });
    const service = instanceServiceResolver('project');

    await expect(service.create({
      relations: { panels: [
        { type: 'panel', id: 'panel-1' },
        { type: 'panel', id: 'panel-1' }
      ] }
    }, 'user-1', 'org-1')).rejects.toMatchObject({ statusCode: 400 });

    expect(coll.insertOne).not.toHaveBeenCalled();
  });

  it('enforces relation target-domain predicates on create', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: 'panel-1',
      type: 'panel',
      typeVersion: 2,
      organizationId: 'org-1',
      fields: { serial: 'OUTSIDE' },
      lineage: {},
      relations: {}
    });
    const service = instanceServiceResolver('project');

    await expect(service.create({
      relations: { panels: [{ type: 'panel', id: 'panel-1' }] }
    }, 'user-1', 'org-1')).rejects.toMatchObject({ statusCode: 400 });

    expect(coll.insertOne).not.toHaveBeenCalled();
  });

  it('refuses relation targets owned by another organization', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: 'panel-1',
      type: 'panel',
      typeVersion: 2,
      organizationId: 'org-2',
      fields: { serial: 'SH-1' },
      lineage: {},
      relations: {}
    });
    const service = instanceServiceResolver('project');

    await expect(service.create({
      relations: { panels: [{ type: 'panel', id: 'panel-1' }] }
    }, 'user-1', 'org-1')).rejects.toMatchObject({ statusCode: 400 });

    expect(coll.insertOne).not.toHaveBeenCalled();
  });

  it('rejects undeclared and unresolved lineage writes through process update', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');

    await expect(service.processUpdate('panel-1', {
      lineage: { unknownParentId: 'parent-1' }
    }, 'org-1')).rejects.toMatchObject({ statusCode: 400 });

    await expect(service.processUpdate('panel-1', {
      lineage: { binId: 'missing-bin' }
    }, 'org-1')).rejects.toMatchObject({ statusCode: 400 });

    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('reserves the organization sequence before process-update writes', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: 'panel-1',
      type: 'panel',
      organizationId: 'org-1',
      fields: {},
      lineage: {}
    });
    coll.findOneAndUpdate.mockResolvedValue({
      _id: 'panel-1',
      type: 'panel',
      organizationId: 'org-1',
      fields: { serial: 'P-1' },
      lineage: {}
    });
    const service = instanceServiceResolver('panel');
    const sequence = await import('./organization-sequence.js');

    await service.processUpdate('panel-1', { fields: { serial: 'P-1' } }, 'org-1');

    expect(sequence.getOrganizationChangeSequence).toHaveBeenCalledWith('org-1');
    expect(sequence.runOrganizationChange).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ kind: 'instance-updated' }),
      expect.any(Function),
      { session: null, expectedSequence: 0 }
    );
  });

  it('stores process-update lineage references as scalar parent ids', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: 'bin-1',
      type: 'bin',
      organizationId: 'org-1',
      lineage: {}
    });
    coll.findOneAndUpdate.mockResolvedValue({
      _id: 'panel-1',
      type: 'panel',
      organizationId: 'org-1',
      fields: {},
      lineage: { binId: 'bin-1' }
    });
    const service = instanceServiceResolver('panel');

    await service.processUpdate('panel-1', {
      lineage: { binId: { type: 'bin', id: 'bin-1' } }
    }, 'org-1');

    expect(coll.findOneAndUpdate.mock.calls[0][1].$set['lineage.binId']).toBe('bin-1');
  });

  it('rejects undeclared relation writes through the process update boundary', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('project');

    await expect(service.processUpdate('project-1', {
      relations: { unknown: { type: 'panel', id: 'panel-1' } }
    }, 'org-1')).rejects.toMatchObject({ statusCode: 400 });
    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects creates and updates that violate typed asynchronous instance constraints', async () => {
    const coll = stubCollection();
    const invoice = {
      _id: 'invoice-1',
      type: 'invoice',
      typeVersion: 1,
      organizationId: 'org-1',
      fields: { code: 'I-1', amount: -5 },
      lineage: {},
      relations: {},
      createdAt: '2026-11-16T10:00:00Z',
      updatedAt: '2026-11-16T10:00:00Z'
    };
    coll.findOne.mockImplementation(async filter => {
      if (filter.type === 'invoice') return invoice;
      if (filter.type === 'constrained-account') {
        return {
          _id: 'account-1',
          type: 'constrained-account',
          typeVersion: 1,
          organizationId: 'org-1',
          fields: { code: 'A-1' },
          lineage: {},
          relations: { invoices: [{ type: 'invoice', id: 'invoice-1' }] },
          createdAt: '2026-11-16T10:00:00Z',
          updatedAt: '2026-11-16T10:00:00Z'
        };
      }
      return null;
    });
    const service = instanceServiceResolver('constrained-account');
    await expect(service.create({
      fields: { code: 'A-2' },
      lineage: {},
      relations: { invoices: [{ type: 'invoice', id: 'invoice-1' }] }
    }, 'user-1', 'org-1')).rejects.toMatchObject({ statusCode: 400 });
    expect(coll.insertOne).not.toHaveBeenCalled();

    await expect(service.processUpdate('account-1', {
      fields: { code: 'A-2' }
    }, 'org-1')).rejects.toMatchObject({ statusCode: 400 });
    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a constrained update when the source record changes after validation', async () => {
    const coll = stubCollection();
    const account = {
      _id: 'account-1',
      type: 'constrained-account',
      typeVersion: 1,
      organizationId: 'org-1',
      fields: { code: 'A-1' },
      lineage: {},
      relations: { invoices: [{ type: 'invoice', id: 'invoice-1' }] },
      createdAt: '2026-11-16T10:00:00Z',
      updatedAt: '2026-11-16T10:00:00Z'
    };
    const invoice = {
      _id: 'invoice-1',
      type: 'invoice',
      typeVersion: 1,
      organizationId: 'org-1',
      fields: { code: 'I-1', amount: 5 },
      lineage: {},
      relations: {},
      createdAt: '2026-11-16T10:00:00Z',
      updatedAt: '2026-11-16T10:00:00Z'
    };
    coll.findOne.mockImplementation(async filter => {
      if (filter.type === 'constrained-account') return account;
      if (filter.type === 'invoice') return invoice;
      return null;
    });
    coll.findOneAndUpdate.mockResolvedValue(null);

    const service = instanceServiceResolver('constrained-account');
    await expect(service.processUpdate('account-1', {
      fields: { code: 'A-2' }
    }, 'org-1')).rejects.toMatchObject({ statusCode: 409 });

    expect(coll.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'account-1', updatedAt: account.updatedAt },
      expect.objectContaining({ $set: expect.objectContaining({ 'fields.code': 'A-2' }) }),
      { returnDocument: 'after' }
    );
  });

  it('creates without a state — nothing synthesizes an initial (SPEC §7)', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');

    const dto = await service.create({ fields: { serial: 'AX-1' }, lineage: {} }, 'user-1', 'org-1');

    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.state).toBeNull();
    expect(stored.revision).toBe(1);
    expect(dto.state).toBeNull();
    expect(dto.revision).toBe(1);
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

  it('fails closed when the active workflow cannot be resolved for a field write', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');
    resolveActiveWorkflow.mockRejectedValueOnce(new Error('workflow store unavailable'));

    await expect(service.processUpdate('507f1f77bcf86cd799439011', {
      fields: { serial: 'AX-4' }
    }, 'org-1')).rejects.toThrow(/workflow store unavailable/);
    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
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

  it('refuses a stale expected revision before an instance patch writes', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      type: 'pdf-document',
      typeVersion: 1,
      revision: 8,
      updatedAt: '2026-11-16T10:00:00.000Z',
      fields: { name: 'Current' },
      lineage: {},
      relations: {}
    });
    const service = instanceServiceResolver('pdf-document');

    await expect(service.patch('507f1f77bcf86cd799439011', {
      fields: { name: 'Stale write' }
    }, {
      organizationId: 'org-1',
      auth: { organizationId: 'org-1', userId: 'user-1' },
      expectedRevision: 7
    })).rejects.toMatchObject({ statusCode: 409 });

    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('uses updatedAt compare-and-swap to close the race after revision validation', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      type: 'pdf-document',
      typeVersion: 1,
      revision: 8,
      updatedAt: '2026-11-16T10:00:00.000Z',
      fields: { name: 'Current' },
      lineage: {},
      relations: {}
    });
    coll.findOneAndUpdate.mockResolvedValue(null);
    const service = instanceServiceResolver('pdf-document');

    await expect(service.patch('507f1f77bcf86cd799439011', {
      fields: { name: 'Concurrent write' }
    }, {
      organizationId: 'org-1',
      auth: { organizationId: 'org-1', userId: 'user-1' },
      expectedRevision: 8
    })).rejects.toMatchObject({ statusCode: 409 });

    expect(coll.findOneAndUpdate.mock.calls[0][0]).toMatchObject({
      updatedAt: '2026-11-16T10:00:00.000Z'
    });
  });

  it('refuses structural edge writes through the generic HTTP patch boundary', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('pdf-document');

    await expect(service.patch('507f1f77bcf86cd799439011', {
      lineage: { projectId: 'foreign-project' }
    }, { organizationId: 'org-1', auth: { organizationId: 'org-1' } }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(service.patch('507f1f77bcf86cd799439011', {
      relations: { attachments: [{ type: 'pdf-document', id: 'foreign-record' }] }
    }, { organizationId: 'org-1', auth: { organizationId: 'org-1' } }))
      .rejects.toMatchObject({ statusCode: 400 });

    expect(coll.findOne).not.toHaveBeenCalled();
    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
  });


  it('refuses patches to fields absent from the resolved CTS declaration', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('panel');

    await expect(service.processUpdate('507f1f77bcf86cd799439011', {
      fields: { undeclaredField: 'not part of the type' }
    }, 'org-1')).rejects.toMatchObject({ statusCode: 400 });

    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
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

  it('orders equal creation timestamps by stable instance identity', async () => {
    const coll = stubCollection();
    const sort = vi.fn(() => ({ limit: () => ({ toArray: async () => [] }) }));
    coll.find.mockReturnValue({ sort });
    const service = instanceServiceResolver('panel');
    await service.processList({}, { userId: 'user-1', organizationId: 'org-1' });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });

  it('applies validated field sorting and bounded offset pagination', async () => {
    const coll = stubCollection();
    const limit = vi.fn(() => ({ toArray: async () => [] }));
    const skip = vi.fn(() => ({ limit }));
    const sort = vi.fn(() => ({ skip }));
    coll.find.mockReturnValue({ sort });
    const service = instanceServiceResolver('panel');
    await service.processList({
      sortBy: 'width',
      sortDirection: 'asc',
      limit: '10',
      offset: '5'
    }, { userId: 'user-1', organizationId: 'org-1' });
    expect(sort).toHaveBeenCalledWith({ 'fields.width': 1, _id: 1 });
    expect(skip).toHaveBeenCalledWith(5);
    expect(limit).toHaveBeenCalledWith(10);
  });

  it('rejects undeclared sort fields and unbounded pagination', async () => {
    const service = instanceServiceResolver('panel');
    await expect(service.processList({ sortBy: 'fields.secret' }, { userId: 'user-1', organizationId: 'org-1' }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(service.processList({ offset: '10001' }, { userId: 'user-1', organizationId: 'org-1' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('filters process entity lookups through the compiled read grant', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: 'panel-1',
      type: 'panel',
      organizationId: 'org-1',
      fields: { serial: 'P-1' }
    });
    const access = await import('../../core/access/service.js');
    access.hasInstanceAccess.mockReturnValueOnce(false);
    const service = instanceServiceResolver('panel');
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      memberships: [{ organizationId: 'org-1', permissions: {} }]
    };

    await expect(service.processGetById('panel-1', auth)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Permission denied'
    });
    expect(access.hasInstanceAccess).toHaveBeenCalledWith(expect.objectContaining({
      typeId: 'panel',
      level: 'read',
      action: 'view',
      auth
    }));
  });

  it('filters process entity queries through the compiled read grant', async () => {
    const coll = stubCollection();
    coll.find.mockReturnValue({
      sort: () => ({
        limit: () => ({
          toArray: async () => [{ _id: 'panel-1', type: 'panel', organizationId: 'org-1' }]
        })
      })
    });
    const access = await import('../../core/access/service.js');
    access.hasInstanceAccess.mockReturnValueOnce(false);
    const service = instanceServiceResolver('panel');

    const items = await service.processList({}, {
      userId: 'user-1',
      memberships: [{ organizationId: 'org-1', permissions: {} }]
    });

    expect(items).toEqual([]);
    expect(access.hasInstanceAccess).toHaveBeenCalledWith(expect.objectContaining({
      typeId: 'panel',
      level: 'read'
    }));
    expect(coll.find.mock.calls[0][0].$or).toEqual([
      { organizationId: 'org-1' },
      { organizationId: null }
    ]);
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
      { name: 'Scoped', lineage: { organizationId: 'spoofed-org' } },
      'user-1',
      'org-1'
    );

    const stored = coll.insertOne.mock.calls[0][0];
    expect(stored.organizationId).toBe('org-1');
    expect(stored.lineage).toEqual({});
    expect(dto.organizationId).toBe('org-1');
    expect(dto.lineage).toEqual({});
  });

  it('derives the lineage chain from referenced parents; authored axes win', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: 'bin-1', type: 'bin', organizationId: 'org-1', lineage: { projectId: 'project-9' }
    });
    const service = instanceServiceResolver('label');

    await service.create({ fields: { code: 'LB-7' }, lineage: { binId: 'bin-1' } }, 'user-1', 'org-1');
    expect(coll.insertOne.mock.calls[0][0].lineage).toEqual({ binId: 'bin-1', projectId: 'project-9' });

    await service.create(
      { fields: { code: 'LB-8' }, lineage: { binId: { type: 'bin', id: 'bin-1' }, projectId: 'authored-project' } },
      'user-1',
      'org-1'
    );
    expect(coll.insertOne.mock.calls[1][0].lineage).toEqual({ binId: 'bin-1', projectId: 'authored-project' });
  });

  it('refuses a lineage parent from another organization', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({ _id: 'foreign-1', type: 'bin', organizationId: 'org-2', lineage: {} });
    const service = instanceServiceResolver('label');
    await expect(service.create({ lineage: { binId: 'foreign-1' } }, 'user-1', 'org-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses tenant-owned lineage parents when the child has no organization scope', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({ _id: 'tenant-parent', type: 'bin', organizationId: 'org-1', lineage: {} });
    const service = instanceServiceResolver('graph-document');

    await expect(service.create({ lineage: { binId: 'tenant-parent' } }, 'user-1', null))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(coll.insertOne).not.toHaveBeenCalled();
  });

  it('createForHttp stores the §3 draft under the access gate and refuses without a grant', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('label'); // item class
    const session = { id: 'create-transaction-session' };

    const dto = await service.createForHttp(
      { name: 'Hanger 40x20', fields: { code: 'H40', note: 'n' } },
      { auth: { userId: 'user-1', organizationId: 'org-1' }, organizationId: 'org-1', session, expectedOrganizationSequence: 2 }
    );

    const stored = coll.insertOne.mock.calls[0][0];
    expect(coll.insertOne.mock.calls[0][1]).toEqual({ session });
    expect(runOrganizationChange).toHaveBeenCalledWith('org-1', expect.objectContaining({ kind: 'instance-created' }), expect.any(Function), { session, expectedSequence: 2 });
    expect(stored.organizationId).toBe('org-1');
    expect(stored.name).toBe('Hanger 40x20');
    expect(stored.fields).toEqual({ code: 'H40', note: 'n' });
    expect(dto.name).toBe('Hanger 40x20');

    const { hasInstanceAccess } = await import('../../core/access/service.js');
    expect(hasInstanceAccess).toHaveBeenLastCalledWith(expect.objectContaining({
      typeId: 'label',
      level: 'write',
      action: 'create'
    }));
    hasInstanceAccess.mockReturnValueOnce(false);
    await expect(service.createForHttp(
      { name: 'Nope', fields: {} },
      { auth: {}, organizationId: 'org-1' }
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it('requires a revisioned payload when graph Bake creates an instance', async () => {
    stubCollection();
    const service = instanceServiceResolver('gallery'); // payload type without a revision scope
    await expect(service.createForHttp({
      payload: { fileId: 'baked-file-1', mime: 'image/png', size: 12 }
    }, {
      auth: { userId: 'user-1', organizationId: 'org-1' },
      organizationId: 'org-1',
      requireRevisionedPayload: true
    })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('revisioned payload')
    });
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
      expect.objectContaining({ typeId: 'gallery', feature: 'files', level: 'write', action: 'create' })
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

  it('refuses to patch an instance through a different organization scope', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: SKETCH_ID,
      type: 'csv-table',
      organizationId: 'org-2',
      revision: 1,
      updatedAt: '2026-11-17T00:00:00.000Z',
      fields: { name: 'Foreign' }
    });
    const service = instanceServiceResolver('csv-table');
    await expect(service.patch(SKETCH_ID, { fields: { name: 'Changed' } }, {
      auth: { userId: 'user-1', organizationId: 'org-1' },
      organizationId: 'org-1'
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('stores, revisions, and swaps the payload for a revisioned type', async () => {
    const coll = stubCollection();
    stubSketchDoc(coll, { revision: 1 });
    const service = instanceServiceResolver('csv-table');

    const session = { id: 'graph-commit-session' };
    const dto = await service.replacePayload(SKETCH_ID, {
      buffer: Buffer.from('a,b\n1,2'),
      filename: 'table.csv',
      mimeType: 'text/csv'
    }, { userId: 'user-1', organizationId: 'org-1', auth: { userId: 'user-1', organizationId: 'org-1' }, session, expectedRevision: 1, expectedOrganizationSequence: 4 });

    const { uploadFile } = await import('../files/service.js');
    const { ensureForEntitySnapshot } = await import('../instance-revisions/service.js');
    expect(uploadFile).toHaveBeenCalledWith(expect.any(Buffer), 'table.csv', expect.objectContaining({ type: 'csv-table' }), 'files');
    expect(ensureForEntitySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      typeId: 'csv-table',
      scope: 'content',
      reason: 'payload-replaced',
      session
    }));
    expect(coll.findOne).toHaveBeenCalledWith({ _id: new ObjectId(SKETCH_ID), type: 'csv-table' }, { session });
    expect(coll.findOneAndUpdate.mock.calls[0][2]).toMatchObject({ session });
    const { runOrganizationChange } = await import('./organization-sequence.js');
    expect(runOrganizationChange).toHaveBeenCalledWith('org-1', expect.objectContaining({ kind: 'instance-payload-replaced' }), expect.any(Function), { session, expectedSequence: 4 });
    const set = coll.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.payload).toMatchObject({ fileId: 'stored-table.csv', mime: 'text/csv' });
    expect(dto.payload.fileId).toBe('stored-table.csv');
    const { hasInstanceAccess } = await import('../../core/access/service.js');
    expect(hasInstanceAccess).toHaveBeenLastCalledWith(expect.objectContaining({
      typeId: 'csv-table',
      level: 'write',
      action: 'update'
    }));
  });

  it('refuses types without a revision scope or payload traits', async () => {
    stubCollection();
    const gallery = instanceServiceResolver('gallery'); // payload, no revisions (org-store fixture)
    await expect(gallery.replacePayload(SKETCH_ID, { buffer: Buffer.from('x'), filename: 'm.png' }, { organizationId: 'org-1' }))
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
      { payload: { fileId: 'img-1', mime: 'image/jpeg', size: 2048, name: 'shot-42.jpeg' } },
      { userId: 'u-1', organizationId: 'org-1' }
    );
    expect(shot.type).toBe('image');
    expect(coll.insertOne.mock.calls[0][0]).toMatchObject({
      name: 'shot-42',
      payload: { fileId: 'img-1', mime: 'image/jpeg' }
    });

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

describe('version fabric (SPEC §24)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mints revision 1 on a payload create of a revision-scoped type', async () => {
    const coll = stubCollection();
    const service = instanceServiceResolver('pdf-document');

    await service.create(
      { name: 'Report', payload: { fileId: 'file-1', mime: 'application/pdf', size: 1024 } },
      'user-1',
      'org-1'
    );

    expect(revisionService.ensureForEntitySnapshot).toHaveBeenCalledTimes(1);
    const call = revisionService.ensureForEntitySnapshot.mock.calls[0][0];
    expect(call.scope).toBe('content');
    expect(call.reason).toBe('created');
    expect(call.content.fileId).toBe('file-1');
    expect(coll.insertOne).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
  });

  it('re-runs the construct over stored inputs and patches fields, payload, and provenance', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: new ObjectId('0123456789abcdef01234567'),
      type: 'pdf-document',
      organizationId: 'org-1',
      updatedAt: '2026-11-16T10:00:00.000Z',
      name: 'Filled report',
      fields: { name: 'Filled report' },
      provenance: { op: 'cts.construct:fill:fill', sources: [], effective: { via: 'fill', parameters: { values: { title: 'Old' } } } }
    });
    coll.findOneAndUpdate.mockResolvedValue({ _id: new ObjectId('0123456789abcdef01234567'), type: 'pdf-document', fields: { name: 'Filled report' } });
    const constructions = vi.spyOn(pluginsService, 'constructionsForOrganization')
      .mockResolvedValue({ 'pdf-document': { fill: 'plugin.documents.fill' } });
    const execute = vi.spyOn(pluginsService, 'invokeConstructionValueService')
      .mockResolvedValue({ data: { pages: 2 }, payload: { base64: Buffer.from('%PDF-1.4 new').toString('base64'), mime: 'application/pdf' } });

    const service = instanceServiceResolver('pdf-document');
    const dto = await service.rederive('0123456789abcdef01234567', 'fill', {
      provenance: { op: 'cts.construct:fill:fill' },
      userId: 'user-1',
      organizationId: 'org-1'
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const parameters = execute.mock.calls[0][1];
    expect(parameters.mode).toBe('fill');
    expect(parameters.draft.data.values).toEqual({ title: 'Old' });
    const patch = coll.findOneAndUpdate.mock.calls[0][1].$set;
    expect(coll.findOneAndUpdate.mock.calls[0][0]).toMatchObject({
      updatedAt: '2026-11-16T10:00:00.000Z'
    });
    expect(runOrganizationChange).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        kind: 'instance-rederived',
        typeId: 'pdf-document',
        instanceId: '0123456789abcdef01234567'
      }),
      expect.any(Function)
    );
    expect(coll.findOneAndUpdate.mock.calls[0][1].$inc).toEqual({ revision: 1 });
    expect(patch.fields.pages).toBe(2);
    expect(patch.provenance.op).toBe('cts.construct:fill:fill');
    expect(patch.payload.fileId).toBe('stored-Filled report.pdf');
    expect(revisionService.ensureForEntitySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'rederived', scope: 'content' })
    );
    expect(dto.type).toBe('pdf-document');
    constructions.mockRestore();
    execute.mockRestore();
  });

  it('rejects a re-derive when its source instance revision changed during execution', async () => {
    const coll = stubCollection();
    coll.findOne.mockResolvedValue({
      _id: new ObjectId('0123456789abcdef01234567'),
      type: 'pdf-document',
      organizationId: 'org-1',
      updatedAt: '2026-11-16T10:00:00.000Z',
      name: 'Filled report',
      fields: { name: 'Filled report' },
      provenance: { op: 'cts.construct:fill:fill', sources: [], effective: { via: 'fill', parameters: { values: { title: 'Old' } } } }
    });
    coll.findOneAndUpdate.mockResolvedValue(null);
    const constructions = vi.spyOn(pluginsService, 'constructionsForOrganization')
      .mockResolvedValue({ 'pdf-document': { fill: 'plugin.documents.fill' } });
    const execute = vi.spyOn(pluginsService, 'invokeConstructionValueService')
      .mockResolvedValue({ data: { pages: 2 } });
    const service = instanceServiceResolver('pdf-document');

    await expect(service.rederive('0123456789abcdef01234567', 'fill', {
      userId: 'user-1',
      organizationId: 'org-1'
    })).rejects.toMatchObject({ statusCode: 409 });

    expect(runOrganizationChange).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ kind: 'instance-rederived' }),
      expect.any(Function)
    );
    expect(revisionService.ensureForEntitySnapshot).not.toHaveBeenCalled();
    constructions.mockRestore();
    execute.mockRestore();
  });

  it('refuses a re-run when the organization binds no service for the mode', async () => {
    stubCollection();
    const constructions = vi.spyOn(pluginsService, 'constructionsForOrganization')
      .mockResolvedValue({});
    const service = instanceServiceResolver('pdf-document');

    await expect(service.rederive('0123456789abcdef01234567', 'fill', { userId: 'user-1', organizationId: 'org-1' }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(revisionService.ensureForEntitySnapshot).not.toHaveBeenCalled();

    constructions.mockRestore();
  });

  describe('restore (SPEC §24 restore-as-new)', () => {
    const DOC_ID = new ObjectId('0123456789abcdef01234567');

    function stubPdfDoc() {
      const coll = stubCollection();
      coll.findOne.mockResolvedValue({
        _id: DOC_ID,
        type: 'pdf-document',
        organizationId: 'org-1',
        name: 'Report',
        fields: {},
        payload: { fileId: 'file-2', mime: 'application/pdf', size: 2048 }
      });
      coll.findOneAndUpdate.mockResolvedValue({
        _id: DOC_ID, type: 'pdf-document', fields: {}, payload: { fileId: 'stored-Report.pdf' }
      });
      return coll;
    }

    function stubRevision(overrides = {}) {
      revisionService.getById.mockResolvedValue({
        _id: 'rev-1',
        data: {
          source: { type: 'pdf-document', id: DOC_ID.toString() },
          scope: 'content',
          number: 1
        },
        ...overrides
      });
      revisionService.pinnedRevisionFile.mockResolvedValue({
        fileId: 'file-1',
        bucket: 'files',
        mime: 'application/pdf',
        name: 'Report.pdf'
      });
    }

    it("re-enters a prior revision's frozen bytes as a new revision", async () => {
      const coll = stubPdfDoc();
      stubRevision();
      const service = instanceServiceResolver('pdf-document');

      const dto = await service.restorePayloadRevision(DOC_ID.toString(), 'rev-1', {
        userId: 'user-1',
        organizationId: 'org-1'
      });

      const files = (await import('../files/service.js'));
      expect(files.getFileBuffer).toHaveBeenCalledWith('file-1', 'files');
      expect(files.uploadFile).toHaveBeenCalledWith(
        Buffer.from('%PDF-1.4 frozen'),
        'Report.pdf',
        expect.objectContaining({ type: 'pdf-document' }),
        'files'
      );
      expect(revisionService.ensureForEntitySnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'payload-restored', scope: 'content' })
      );
      expect(coll.findOneAndUpdate.mock.calls[0][1].$set.payload).toMatchObject({
        fileId: 'stored-Report.pdf',
        mime: 'application/pdf'
      });
      expect(dto.payload.fileId).toBe('stored-Report.pdf');
    });

    it('refuses a revision of another record, type, or scope', async () => {
      stubPdfDoc();
      const service = instanceServiceResolver('pdf-document');

      stubRevision({ data: { source: { type: 'pdf-document', id: 'other-record' }, scope: 'content', number: 1 } });
      await expect(service.restorePayloadRevision(DOC_ID.toString(), 'rev-1', { userId: 'user-1', organizationId: 'org-1' }))
        .rejects.toMatchObject({ statusCode: 400 });

      stubRevision({ data: { source: { type: 'other-type', id: DOC_ID.toString() }, scope: 'content', number: 1 } });
      await expect(service.restorePayloadRevision(DOC_ID.toString(), 'rev-1', { userId: 'user-1', organizationId: 'org-1' }))
        .rejects.toMatchObject({ statusCode: 400 });

      stubRevision({ data: { source: { type: 'pdf-document', id: DOC_ID.toString() }, scope: 'geometry', number: 1 } });
      await expect(service.restorePayloadRevision(DOC_ID.toString(), 'rev-1', { userId: 'user-1', organizationId: 'org-1' }))
        .rejects.toMatchObject({ statusCode: 400 });

      expect(revisionService.ensureForEntitySnapshot).not.toHaveBeenCalled();
    });

    it('refuses an unknown instance or a revision without frozen bytes', async () => {
      const coll = stubPdfDoc();
      coll.findOne.mockResolvedValue(null);
      const service = instanceServiceResolver('pdf-document');

      await expect(service.restorePayloadRevision(DOC_ID.toString(), 'rev-1', { userId: 'user-1', organizationId: 'org-1' }))
        .rejects.toMatchObject({ statusCode: 404 });

      coll.findOne.mockResolvedValue({
        _id: DOC_ID, type: 'pdf-document', organizationId: 'org-1', fields: {}
      });
      stubRevision();
      revisionService.pinnedRevisionFile.mockResolvedValue(null);
      await expect(service.restorePayloadRevision(DOC_ID.toString(), 'rev-1', { userId: 'user-1', organizationId: 'org-1' }))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(revisionService.ensureForEntitySnapshot).not.toHaveBeenCalled();
    });

    it('refuses without the write grant', async () => {
      stubPdfDoc();
      stubRevision();
      const access = (await import('../../core/access/service.js'));
      access.hasInstanceAccess.mockReturnValueOnce(false);
      const service = instanceServiceResolver('pdf-document');

      await expect(service.restorePayloadRevision(DOC_ID.toString(), 'rev-1', { userId: 'user-1', organizationId: 'org-1' }))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(revisionService.ensureForEntitySnapshot).not.toHaveBeenCalled();
    });
  });
});

describe('remove sweeps relation refs (SPEC §22.12)', () => {
  beforeEach(() => vi.clearAllMocks());

  const PANEL_ID = 'panel-7';

  function stubPanel(overrides = {}) {
    const coll = stubCollection();
    coll.deleteOne.mockResolvedValue({ deletedCount: 1 });
    coll.findOne.mockResolvedValue({
      _id: PANEL_ID,
      type: 'panel',
      organizationId: 'org-1',
      fields: { serial: 'P-7' },
      lineage: {},
      ...overrides
    });
    return coll;
  }

  function stubReferrers(referrer) {
    return vi.spyOn(repository, 'findInstancesByFilter')
      .mockResolvedValue(referrer ? [referrer] : []);
  }

  it('rewrites relation slots on every referrer and publishes the event', async () => {
    const coll = stubPanel();
    const referrer = {
      _id: 'project-1',
      type: 'project',
      organizationId: 'org-1',
      relations: {
        panels: [{ type: 'panel', id: PANEL_ID }, { type: 'panel', id: 'panel-8' }],
        library: { type: 'panel', id: PANEL_ID }
      }
    };
    const find = stubReferrers(referrer);
    const service = instanceServiceResolver('panel');

    await service.remove(PANEL_ID, { actor: 'user-1', organizationId: 'org-1' });

    expect(coll.deleteOne).toHaveBeenCalledWith({ _id: PANEL_ID }, { session: transactionSession });
    // Both declared edges over panel — the explicit `panels` edge and the
    // `library` ref field — scanned the owner collection.
    const scans = find.mock.calls.filter(([, filter]) => filter.type === 'project');
    expect(scans).toHaveLength(2);
    expect(scans[0][1].$or).toEqual([
      { 'relations.panels.id': { $in: [PANEL_ID] } },
      { 'relations.panels': { $in: [PANEL_ID] } }
    ]);
    const set = coll.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set['relations.panels']).toEqual([{ type: 'panel', id: 'panel-8' }]);
    expect(coll.findOneAndUpdate.mock.calls[1][1].$set['relations.library']).toBeNull();

    const { publishEntityChanged } = await import('../instance-events/service.js');
    expect(publishEntityChanged).toHaveBeenCalledWith(
      { userId: 'user-1', organizationId: 'org-1' },
      { type: 'project', id: 'project-1', change: 'updated', reason: 'ref-sweep' }
    );
    find.mockRestore();
  });

  it('keeps the ref sweep and delete in the caller transaction and sequence fence', async () => {
    const coll = stubPanel();
    const session = { id: 'mongo-session' };
    const find = stubReferrers({
      _id: 'project-5',
      type: 'project',
      organizationId: 'org-1',
      relations: { library: { type: 'panel', id: PANEL_ID } }
    });
    const { runOrganizationChange } = await import('./organization-sequence.js');
    const service = instanceServiceResolver('panel');

    await service.remove(PANEL_ID, {
      actor: 'user-1',
      organizationId: 'org-1',
      session,
      expectedOrganizationSequence: 17
    });

    expect(find.mock.calls[0][2]).toEqual({ session });
    expect(coll.findOneAndUpdate.mock.calls[0][2]).toEqual(expect.objectContaining({ session }));
    expect(coll.deleteOne).toHaveBeenCalledWith(
      { _id: PANEL_ID },
      { session }
    );
    expect(runOrganizationChange).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ kind: 'instance-deleted', instanceId: PANEL_ID }),
      expect.any(Function),
      { session, expectedSequence: 17 }
    );
    find.mockRestore();
  });

  it('nulls a single relation ref and keeps other targets of a multi-target slot', async () => {
    const coll = stubPanel();
    const referrer = {
      _id: 'project-2',
      type: 'project',
      organizationId: 'org-1',
      relations: { library: { type: 'panel', id: PANEL_ID } }
    };
    const find = stubReferrers(referrer);
    const service = instanceServiceResolver('panel');

    await service.remove(PANEL_ID, { organizationId: 'org-1' });

    const set = coll.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set['relations.library']).toBeNull();
    find.mockRestore();
  });

  it('keeps a ref of another type sharing the deleted id (multi-target edges)', async () => {
    const coll = stubPanel();
    const referrer = {
      _id: 'project-3',
      type: 'project',
      organizationId: 'org-1',
      relations: { panels: [{ type: 'bin', id: PANEL_ID }, { type: 'panel', id: PANEL_ID }] }
    };
    const find = stubReferrers(referrer);
    const service = instanceServiceResolver('panel');

    await service.remove(PANEL_ID, { organizationId: 'org-1' });

    const set = coll.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set['relations.panels']).toEqual([{ type: 'bin', id: PANEL_ID }]);
    find.mockRestore();
  });

  it('derives a system target\'s edges from the static view alone', async () => {
    stubPanel({ organizationId: null });
    const find = stubReferrers([]);
    const service = instanceServiceResolver('panel');

    await service.remove(PANEL_ID, { organizationId: 'org-1' });

    // org-1's project edges stay out: a system row is referenced through
    // its pack's declared relations (README: system targets sweep the
    // static view's edges).
    expect(find).not.toHaveBeenCalled();
    find.mockRestore();
  });

  it('skips the scan when no declared edge targets the type', async () => {
    const coll = stubPanel();
    const find = stubReferrers([]);
    const service = instanceServiceResolver('label');

    await service.remove('label-1', { organizationId: 'org-1' });

    expect(find).not.toHaveBeenCalled();
    expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
    find.mockRestore();
  });

  it('resolves the delete declaration from the entity organization, not the caller default', async () => {
    invalidateInstanceDeclarations('org-2');
    const coll = stubPanel({ organizationId: 'org-2' });
    stubReferrers([]);
    const findEntity = vi.spyOn(repository, 'findInstanceAnywhere').mockResolvedValue({
      _id: PANEL_ID,
      type: 'panel',
      organizationId: 'org-2',
      fields: { serial: 'P-7' },
      lineage: {}
    });
    const service = instanceServiceResolver('panel');

    await service.removeForHttp(PANEL_ID, {
      auth: {
        userId: 'user-1',
        memberships: [{ organizationId: 'org-2', permissions: {} }]
      },
      organizationId: 'org-1'
    });

    expect(coll.deleteOne).toHaveBeenCalledWith({ _id: PANEL_ID }, { session: transactionSession });
    expect(pluginInstalls.findDeclarationByTypeId).toHaveBeenCalledWith('org-2', 'panel');
    findEntity.mockRestore();
  });

  it('publishes ref-sweep refresh events only after the authorized delete transaction commits', async () => {
    const coll = stubPanel();
    const find = stubReferrers({
      _id: 'project-6',
      type: 'project',
      organizationId: 'org-1',
      relations: { library: { type: 'panel', id: PANEL_ID } }
    });
    const events = await import('../instance-events/service.js');
    const service = instanceServiceResolver('panel');

    await service.removeForHttp(PANEL_ID, {
      auth: { userId: 'user-1', organizationId: 'org-1' },
      organizationId: 'org-1'
    });

    expect(transactionSession.withTransaction).toHaveBeenCalledTimes(1);
    expect(events.publishEntityChanged).toHaveBeenCalledWith(
      { userId: 'user-1', organizationId: 'org-1' },
      { type: 'project', id: 'project-6', change: 'updated', reason: 'ref-sweep' }
    );
    expect(transactionSession.withTransaction.mock.invocationCallOrder[0])
      .toBeLessThan(events.publishEntityChanged.mock.invocationCallOrder[0]);
    find.mockRestore();
  });

  it('enforces the entity write grant for process deletes', async () => {
    const coll = stubPanel();
    const access = await import('../../core/access/service.js');
    access.hasInstanceAccess.mockReturnValueOnce(false);
    const service = instanceServiceResolver('panel');

    await expect(service.processDelete(PANEL_ID, {
      userId: 'user-1',
      organizationId: 'org-1'
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(access.hasInstanceAccess).toHaveBeenCalledWith(expect.objectContaining({
      typeId: 'panel',
      level: 'write',
      action: 'delete'
    }));
    expect(coll.deleteOne).not.toHaveBeenCalled();
  });

  it('removes through the HTTP transport gate and sweeps before the delete', async () => {
    const coll = stubPanel();
    const find = stubReferrers({
      _id: 'project-4',
      type: 'project',
      organizationId: 'org-1',
      relations: { library: { type: 'panel', id: PANEL_ID } }
    });
    const service = instanceServiceResolver('panel');

    await service.removeForHttp(PANEL_ID, { auth: { userId: 'user-1' }, organizationId: 'org-1' });

    expect(coll.deleteOne).toHaveBeenCalledWith(expect.any(Object), { session: transactionSession });
    expect(coll.findOneAndUpdate.mock.calls[0][1].$set['relations.library']).toBeNull();
    find.mockRestore();
  });
});
