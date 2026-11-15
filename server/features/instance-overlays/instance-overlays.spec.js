// Failure modes first (the instance-overlays README contract): org
// scoping, the record's write-grant refusal, overlay keying (one per
// instance), and block/order fidelity — the stored shape round-trips
// verbatim and one PATCH replaces the whole document.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { mockedConnectDB, mockedHasInstanceAccess, mockedProcessGetById, instancesById } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn(),
  mockedHasInstanceAccess: vi.fn(() => true),
  mockedProcessGetById: vi.fn(),
  instancesById: new Map()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

vi.mock('h3', () => ({
  createError: vi.fn(err => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

vi.mock('../../runtime/app-registry.js', () => ({
  getAppRegistry: () => ({
    getInstanceService: typeId => (instancesById.has(`${typeId}:*`)
      ? { processGetById: (id, auth) => mockedProcessGetById(typeId, id, auth) }
      : null)
  })
}));

vi.mock('../instances/service.js', () => ({
  declarationForType: async typeId => ({ id: typeId, class: 'item' }),
  writeGrantTarget: async declaration => ({ typeId: declaration.id, feature: 'items' })
}));

vi.mock('../../core/access/service.js', () => ({
  hasInstanceAccess: mockedHasInstanceAccess
}));

import * as overlaysService from './service.js';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const TYPE = 't-wall';

const memberOf = organizationId => ({ userId: 'user-1', organizationId });

// The org-a record the overlays hang on, in the generic instance
// service's DTO shape.
const OWN_RECORD = { _id: 'i-1', type: TYPE, organizationId: ORG_A, lineage: {}, fields: {} };

describe('instance overlays', () => {
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
    await db.collection('instance_overlays').deleteMany({});
    instancesById.clear();
    instancesById.set(`${TYPE}:*`, true);
    instancesById.set(`${TYPE}:i-1`, OWN_RECORD);
    mockedHasInstanceAccess.mockReturnValue(true);
    mockedProcessGetById.mockImplementation(async (typeId, id) => instancesById.get(`${typeId}:${id}`) || null);
  });

  const OVERLAY = {
    blocks: [
      { id: 'b1', kind: 'text', text: '## Notes\nBody copy.' },
      { id: 'b2', kind: 'view', view: { id: 'v-9', name: 'Open walls' } }
    ],
    order: ['properties', 'b1', 'relation:linked', 'editor', 'b2']
  };

  it('loads the backing instance with the caller auth and separates update from delete grants', async () => {
    const auth = memberOf(ORG_A);
    await overlaysService.upsert(TYPE, 'i-1', OVERLAY, auth);
    expect(mockedProcessGetById).toHaveBeenCalledWith(TYPE, 'i-1', auth);
    expect(mockedHasInstanceAccess).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'update' }));

    mockedHasInstanceAccess.mockImplementation(({ action }) => action === 'update');
    await expect(overlaysService.remove(TYPE, 'i-1', auth)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockedHasInstanceAccess).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'delete' }));
  });

  it('refuses every operation without an active organization', async () => {
    const auth = { userId: 'user-1', organizationId: null };
    await expect(overlaysService.getOverlay(TYPE, 'i-1', auth)).rejects.toMatchObject({ statusCode: 403 });
    await expect(overlaysService.upsert(TYPE, 'i-1', OVERLAY, auth)).rejects.toMatchObject({ statusCode: 403 });
    await expect(overlaysService.remove(TYPE, 'i-1', auth)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('answers null for an instance nobody customized and round-trips the whole overlay', async () => {
    const auth = memberOf(ORG_A);
    await expect(overlaysService.getOverlay(TYPE, 'i-1', auth)).resolves.toBeNull();
    await overlaysService.upsert(TYPE, 'i-1', OVERLAY, auth);
    await expect(overlaysService.getOverlay(TYPE, 'i-1', auth)).resolves.toMatchObject({
      typeId: TYPE,
      instanceId: 'i-1',
      blocks: OVERLAY.blocks,
      order: OVERLAY.order
    });
  });

  it('keeps one overlay per instance: a second PATCH replaces the whole document', async () => {
    const auth = memberOf(ORG_A);
    await overlaysService.upsert(TYPE, 'i-1', OVERLAY, auth);
    const next = { blocks: [{ id: 'b3', kind: 'text', text: 'Fresh' }], order: ['editor', 'b3'] };
    await overlaysService.upsert(TYPE, 'i-1', next, auth);
    await expect(overlaysService.getOverlay(TYPE, 'i-1', auth)).resolves.toMatchObject(next);
    const rows = await db.collection('instance_overlays').find({}).toArray();
    expect(rows).toHaveLength(1);
  });

  it('scopes reads to the caller organization', async () => {
    await overlaysService.upsert(TYPE, 'i-1', OVERLAY, memberOf(ORG_A));
    await expect(overlaysService.getOverlay(TYPE, 'i-1', memberOf(ORG_B))).resolves.toBeNull();
  });

  it('answers 404 for an unknown type, a missing record, and a foreign record', async () => {
    const auth = memberOf(ORG_A);
    await expect(overlaysService.upsert('t-ghost', 'i-1', OVERLAY, auth)).rejects.toMatchObject({ statusCode: 404 });
    await expect(overlaysService.upsert(TYPE, 'i-404', OVERLAY, auth)).rejects.toMatchObject({ statusCode: 404 });
    instancesById.set(`${TYPE}:i-1`, { ...OWN_RECORD, organizationId: ORG_B });
    await expect(overlaysService.upsert(TYPE, 'i-1', OVERLAY, auth)).rejects.toMatchObject({ statusCode: 404 });
    instancesById.set(`${TYPE}:i-1`, OWN_RECORD);
  });

  it('refuses writes without the record write grant', async () => {
    mockedHasInstanceAccess.mockReturnValue(false);
    await expect(overlaysService.upsert(TYPE, 'i-1', OVERLAY, memberOf(ORG_A))).rejects.toMatchObject({ statusCode: 403 });
    mockedHasInstanceAccess.mockReturnValue(true);
    await overlaysService.upsert(TYPE, 'i-1', OVERLAY, memberOf(ORG_A));
    mockedHasInstanceAccess.mockReturnValue(false);
    await expect(overlaysService.remove(TYPE, 'i-1', memberOf(ORG_A))).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses malformed blocks and orders with 400', async () => {
    const auth = memberOf(ORG_A);
    const cases = [
      { blocks: 'nope', order: [] },
      { blocks: [{ id: 'b1', kind: 'ai', text: '' }], order: [] },
      { blocks: [{ id: '', kind: 'text', text: '' }], order: [] },
      { blocks: [{ id: 'b1', kind: 'text', text: 'a' }, { id: 'b1', kind: 'text', text: 'b' }], order: [] },
      { blocks: [{ id: 'b1', kind: 'view' }], order: [] },
      { blocks: [], order: 'properties' },
      { blocks: [], order: [42] }
    ];
    for (const payload of cases) {
      await expect(overlaysService.upsert(TYPE, 'i-1', payload, auth)).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('deletes the overlay and answers 404 when none exists', async () => {
    const auth = memberOf(ORG_A);
    await expect(overlaysService.remove(TYPE, 'i-1', auth)).rejects.toMatchObject({ statusCode: 404 });
    await overlaysService.upsert(TYPE, 'i-1', OVERLAY, auth);
    await overlaysService.remove(TYPE, 'i-1', auth);
    await expect(overlaysService.getOverlay(TYPE, 'i-1', auth)).resolves.toBeNull();
  });
});
