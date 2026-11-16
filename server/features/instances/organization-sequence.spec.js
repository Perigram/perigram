import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { connectDB } = vi.hoisted(() => ({ connectDB: vi.fn() }));
vi.mock('~/server/db/mongo', () => ({ connectDB }));

import {
  getOrganizationChangeSequence,
  recordOrganizationChange,
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
