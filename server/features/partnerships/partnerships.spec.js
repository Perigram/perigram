import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as partnershipsService from './service.js';

const orgA = 'org-a';
const orgB = 'org-b';
const adminA = {
  userId: 'admin-a',
  organizationId: orgA,
  permissions: { organizations: { level: 'admin' } }
};
const adminB = {
  userId: 'admin-b',
  organizationId: orgB,
  permissions: { organizations: { level: 'admin' } }
};

describe('partnership machine', () => {
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
    await db.collection('organizations').deleteMany({});
    await db.collection('partnerships').deleteMany({});
    await db.collection('status_events').deleteMany({});
    await db.collection('organizations').insertMany([
      { _id: orgA, identity: { uid: orgA, name: 'Organization A' }, data: { type: 'Contractor' } },
      { _id: orgB, identity: { uid: orgB, name: 'Organization B' }, data: { type: 'Contractor' } }
    ]);
  });

  async function latestStatus(targetId) {
    return db.collection('status_events')
      .find({ targetId: new ObjectId(targetId), targetType: 'partnership' })
      .sort({ _id: -1 })
      .limit(1)
      .next();
  }

  async function requestPartnership() {
    return await partnershipsService.request({
      partnerOrganizationId: orgB,
      auth: adminA
    });
  }

  it('creates a pending request with a pending status event', async () => {
    const partnership = await requestPartnership();

    expect(partnership.status).toBe('pending');
    expect((await db.collection('partnerships').findOne({ _id: new ObjectId(partnership._id) })).status)
      .toBe('pending');
    expect((await latestStatus(partnership._id)).status.state.primary).toBe('pending');
  });

  it('accepts a pending request into active', async () => {
    const partnership = await requestPartnership();

    const accepted = await partnershipsService.respond(partnership._id, adminB, 'accept');

    expect(accepted.status).toBe('active');
    expect((await db.collection('partnerships').findOne({ _id: new ObjectId(partnership._id) })).status)
      .toBe('active');
    expect((await latestStatus(partnership._id)).status.state.primary).toBe('active');
  });

  it('declines a pending request from the partner side', async () => {
    const partnership = await requestPartnership();

    const declined = await partnershipsService.respond(partnership._id, adminB, 'decline');

    expect(declined.status).toBe('declined');
    expect((await db.collection('partnerships').findOne({ _id: new ObjectId(partnership._id) })).status)
      .toBe('declined');
    expect((await latestStatus(partnership._id)).status.state.primary).toBe('declined');
  });

  it('lets only the requester cancel a pending request', async () => {
    const partnership = await requestPartnership();

    await expect(partnershipsService.terminate(partnership._id, adminB))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(partnershipsService.terminate(partnership._id, adminA))
      .resolves.toEqual({ success: true });

    expect((await db.collection('partnerships').findOne({ _id: new ObjectId(partnership._id) })).status)
      .toBe('declined');
    expect((await latestStatus(partnership._id)).status.state.primary).toBe('declined');
  });

  it('lets either side terminate an active partnership', async () => {
    const first = await requestPartnership();
    await partnershipsService.respond(first._id, adminB, 'accept');
    await partnershipsService.terminate(first._id, adminB);
    expect((await db.collection('partnerships').findOne({ _id: new ObjectId(first._id) })).status)
      .toBe('terminated');
    expect((await latestStatus(first._id)).status.state.primary).toBe('terminated');

    await db.collection('partnerships').deleteMany({});
    await db.collection('status_events').deleteMany({});
    const second = await requestPartnership();
    await partnershipsService.respond(second._id, adminB, 'accept');
    await partnershipsService.terminate(second._id, adminA);
    expect((await db.collection('partnerships').findOne({ _id: new ObjectId(second._id) })).status)
      .toBe('terminated');
    expect((await latestStatus(second._id)).status.state.primary).toBe('terminated');
  });
});
