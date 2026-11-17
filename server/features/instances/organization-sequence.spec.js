import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { connectDB } = vi.hoisted(() => ({ connectDB: vi.fn() }));
vi.mock('~/server/db/mongo', () => ({ connectDB }));

import {
  beginOrganizationChange,
  completeOrganizationChange,
  getOrganizationChangeSequence,
  recordOrganizationChange,
  runOrganizationChange,
  withOrganizationChangeSequence
} from './organization-sequence.js';

describe('organization change sequence', () => {
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
  });

  it('increments one durable sequence per organization and records change identity', async () => {
    expect(await getOrganizationChangeSequence('org-a')).toBe(0);
    await expect(recordOrganizationChange('org-a', {
      kind: 'instance-updated',
      typeId: 'part',
      instanceId: 'part-1',
      paths: ['fields.width', 'fields.name', 'fields.width'],
      actorId: 'user-1'
    })).resolves.toBe(1);
    await expect(recordOrganizationChange('org-a', {
      kind: 'relation-linked',
      typeId: 'part',
      instanceId: 'part-1'
    })).resolves.toBe(2);
    await expect(getOrganizationChangeSequence('org-a')).resolves.toBe(2);
    await expect(getOrganizationChangeSequence('org-b')).resolves.toBe(0);
    const record = await db.collection('organization_change_sequences').findOne({ organizationId: 'org-a' });
    expect(record.lastChange).toMatchObject({
      kind: 'relation-linked',
      typeId: 'part',
      instanceId: 'part-1',
      paths: [],
      actorId: null
    });
  });

  it('exclusively fences organization writes while a preview-based commit is reserved', async () => {
    const token = await beginOrganizationChange('org-a', { expectedSequence: 0 });
    await expect(beginOrganizationChange('org-a')).rejects.toMatchObject({
      statusCode: 409,
      code: 'ORGANIZATION_WRITE_RESERVED'
    });
    await completeOrganizationChange('org-a', token, { kind: 'graph-commit' });
    const next = await beginOrganizationChange('org-a');
    await completeOrganizationChange('org-a', next, { kind: 'ordinary-write' });
    await expect(getOrganizationChangeSequence('org-a')).resolves.toBe(2);
  });

  it('brackets a stable read with the exact organization sequence', async () => {
    await recordOrganizationChange('org-a', { kind: 'seed' });
    const result = await withOrganizationChangeSequence('org-a', async () => ({ items: ['part-1'] }));
    expect(result).toEqual({
      value: { items: ['part-1'] },
      boundary: {
        consistency: 'sequence-bracketed',
        snapshotId: null,
        organizationSequenceStart: 1,
        organizationSequenceEnd: 1
      }
    });
  });

  it('retries a read if an authoritative write changes the sequence during it', async () => {
    let calls = 0;
    const result = await withOrganizationChangeSequence('org-a', async () => {
      calls += 1;
      if (calls === 1) await recordOrganizationChange('org-a', { kind: 'concurrent-write' });
      return { attempt: calls };
    });
    expect(calls).toBe(2);
    expect(result.boundary).toMatchObject({
      consistency: 'sequence-bracketed',
      organizationSequenceStart: 1,
      organizationSequenceEnd: 1
    });
    expect(result.value).toEqual({ attempt: 2 });
  });

  it('refuses to claim consistency when the sequence keeps changing', async () => {
    await expect(withOrganizationChangeSequence('org-a', async () => {
      await recordOrganizationChange('org-a', { kind: 'concurrent-write' });
      return null;
    }, { retries: 1 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'STALE_ORGANIZATION_READ'
    });
  });

  it('reserves an expected sequence with a session and refuses stale reservations', async () => {
    const session = client.startSession();
    try {
      await expect(runOrganizationChange('org-a', { kind: 'graph-commit' }, async () => {
        await db.collection('atomic-write-test').insertOne({ marker: 'committed' }, { session });
      }, { session, expectedSequence: 0 })).resolves.toBeUndefined();
      await expect(getOrganizationChangeSequence('org-a')).resolves.toBe(1);
      await expect(db.collection('atomic-write-test').findOne({ marker: 'committed' })).resolves.toMatchObject({ marker: 'committed' });
      await expect(runOrganizationChange('org-a', { kind: 'stale-commit' }, async () => null, {
        session,
        expectedSequence: 0
      })).rejects.toMatchObject({ statusCode: 409, code: 'STALE_ORGANIZATION_READ' });
    } finally {
      await session.endSession();
    }
  });

  it('does not claim organization consistency without an organization scope', async () => {
    const result = await withOrganizationChangeSequence(null, async () => 'value');
    expect(result).toEqual({
      value: 'value',
      boundary: {
        consistency: 'unverified',
        snapshotId: null,
        organizationSequenceStart: null,
        organizationSequenceEnd: null
      }
    });
  });
});
