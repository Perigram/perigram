// The migration executor carries no reservation of its own: cts-types
// defineType and plugin upgrades hold the organization sequence reservation
// around the whole batch (README §Organization change sequence). Adding one
// here would nest reservations and deadlock the exclusive token.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { connectDB } = vi.hoisted(() => ({ connectDB: vi.fn() }));
vi.mock('~/server/db/mongo', () => ({ connectDB }));

vi.mock('../instance-events/service.js', () => ({
  publishEntityChanged: vi.fn(async () => null)
}));

import {
  beginOrganizationChange,
  getOrganizationChangeSequence,
  recordOrganizationChange,
  runOrganizationChange
} from './organization-sequence.js';
import { applyTypeMigrationSteps } from './migrations.js';

const ORG = 'org-migration';

function behindDocs() {
  return [
    { _id: 'g-1', type: 'gadget', typeVersion: 3, organizationId: ORG, states: { main: 'scrap' }, fields: { note: 'a' } },
    { _id: 'g-2', type: 'gadget', typeVersion: 3, organizationId: ORG, states: { main: 'scrap' }, fields: { note: 'b' } },
    { _id: 'g-3', type: 'gadget', typeVersion: 3, organizationId: ORG, states: { main: 'ready' }, fields: {} }
  ];
}

function migrateBatch() {
  return applyTypeMigrationSteps({
    declaration: { id: 'gadget', class: 'file' },
    organizationId: ORG,
    steps: [{ kind: 'rename-enum-value', axis: 'main', from: 'scrap', to: 'recycled' }],
    toVersion: 4,
    actor: 'admin'
  });
}

function declarationMetadata() {
  return { kind: 'cts-type-declared', typeId: 'gadget', paths: ['typeVersion'] };
}

describe('type-migration batches under the organization sequence reservation', () => {
  let mongo;
  let client;
  let db;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongo.getUri());
    db = client.db();
    connectDB.mockResolvedValue(db);
  });

  afterAll(async () => {
    await client?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await db.collection('organization_change_sequences').deleteMany({});
    await db.collection('files').deleteMany({});
    await db.collection('files').insertMany(behindDocs());
  });

  async function gadgetDocs() {
    return await db.collection('files').find({ type: 'gadget' }).sort({ _id: 1 }).toArray();
  }

  it('holds one exclusive reservation for the batch and advances the sequence exactly once', async () => {
    const expected = await getOrganizationChangeSequence(ORG);
    const summary = await runOrganizationChange(ORG, declarationMetadata(), async () => {
      await expect(beginOrganizationChange(ORG)).rejects.toMatchObject({
        statusCode: 409,
        code: 'ORGANIZATION_WRITE_RESERVED'
      });
      return await migrateBatch();
    }, { expectedSequence: expected });

    expect(summary.counts).toEqual({ 'rename-enum-value': 2 });
    expect(await getOrganizationChangeSequence(ORG)).toBe(expected + 1);
    const docs = await gadgetDocs();
    expect(docs.map(doc => doc.typeVersion)).toEqual([4, 4, 4]);
    expect(docs.map(doc => doc.states.main)).toEqual(['recycled', 'recycled', 'ready']);
    expect(docs[0].revision).toBe(1);
    const boundary = await db.collection('organization_change_sequences').findOne({ organizationId: ORG });
    expect(boundary.pendingCount).toBe(0);
    expect(boundary.pendingOperations).toEqual([]);
    expect(boundary.lastChange).toMatchObject({ kind: 'cts-type-declared', typeId: 'gadget' });
  });

  it('rejects the batch with the stale-sequence conflict and writes nothing when a concurrent write lands first', async () => {
    const expected = await getOrganizationChangeSequence(ORG);
    await recordOrganizationChange(ORG, { kind: 'instance-updated', typeId: 'gadget', instanceId: 'g-1' });

    await expect(runOrganizationChange(ORG, declarationMetadata(), migrateBatch, {
      expectedSequence: expected
    })).rejects.toMatchObject({ statusCode: 409, code: 'STALE_ORGANIZATION_READ' });

    const docs = await gadgetDocs();
    expect(docs.map(doc => doc.typeVersion)).toEqual([3, 3, 3]);
    expect(docs.map(doc => doc.states.main)).toEqual(['scrap', 'scrap', 'ready']);
    expect(docs.every(doc => doc.revision === undefined)).toBe(true);
    expect(await getOrganizationChangeSequence(ORG)).toBe(expected + 1);
    const boundary = await db.collection('organization_change_sequences').findOne({ organizationId: ORG });
    expect(boundary.pendingCount).toBe(0);
  });
});
