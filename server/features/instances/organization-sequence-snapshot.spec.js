import { beforeEach, describe, expect, it, vi } from 'vitest';

const { connectDB, sequenceCollection, session } = vi.hoisted(() => ({
  connectDB: vi.fn(),
  sequenceCollection: {
    createIndex: vi.fn(async () => 'organizationId_1'),
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn()
  },
  session: {
    withTransaction: vi.fn(),
    endSession: vi.fn(async () => {}),
    snapshotTime: { toString: () => 'snapshot-42' }
  }
}));
vi.mock('~/server/db/mongo', () => ({ connectDB }));

import { withOrganizationDataSnapshot } from './organization-sequence.js';

describe('organization data snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sequenceCollection.findOne.mockResolvedValue({ sequence: 7, pendingCount: 0 });
    session.withTransaction.mockImplementation(async callback => await callback());
    connectDB.mockResolvedValue({
      client: { startSession: () => session },
      collection: name => {
        if (name !== 'organization_change_sequences') throw new Error('unexpected collection');
        return sequenceCollection;
      }
    });
  });

  it('runs the authorized read inside a Mongo snapshot and records its timestamp', async () => {
    const read = vi.fn(async activeSession => ({ session: activeSession, rows: ['part-1'] }));
    const result = await withOrganizationDataSnapshot('org-1', read);
    expect(session.withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      readConcern: { level: 'snapshot' },
      readPreference: 'primary'
    });
    expect(read).toHaveBeenCalledWith(session);
    expect(result).toEqual({
      value: { session, rows: ['part-1'] },
      boundary: {
        consistency: 'snapshot',
        snapshotId: 'snapshot-42',
        organizationSequenceStart: 7,
        organizationSequenceEnd: 7
      }
    });
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('falls back to sequence bracketing when Mongo does not support snapshot transactions', async () => {
    session.withTransaction.mockRejectedValue(Object.assign(
      new Error('Transaction numbers are only allowed on a replica set member or mongos'),
      { code: 20, codeName: 'IllegalOperation' }
    ));
    const read = vi.fn(async activeSession => ({ session: activeSession }));
    const result = await withOrganizationDataSnapshot('org-1', read);
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(null);
    expect(result.boundary).toMatchObject({
      consistency: 'sequence-bracketed',
      organizationSequenceStart: 7,
      organizationSequenceEnd: 7
    });
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('retries when the organization sequence changes around the snapshot', async () => {
    let boundaryRead = 0;
    sequenceCollection.findOne.mockImplementation(async () => {
      boundaryRead += 1;
      return { sequence: boundaryRead === 1 ? 7 : 8, pendingCount: 0 };
    });
    let reads = 0;
    session.withTransaction.mockImplementation(async callback => {
      reads += 1;
      return await callback();
    });
    const result = await withOrganizationDataSnapshot('org-1', async () => reads);
    expect(reads).toBe(2);
    expect(result).toMatchObject({
      value: 2,
      boundary: {
        consistency: 'snapshot',
        organizationSequenceStart: 8,
        organizationSequenceEnd: 8
      }
    });
    expect(session.endSession).toHaveBeenCalledTimes(2);
  });
});
