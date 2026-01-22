import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as remnantService from './service';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

vi.mock('~/server/utils/auth-helpers', () => ({
  hasPermission: vi.fn(() => true)
}));

describe('Remnants & Reusability Logic', () => {
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
    await db.collection('remnants').deleteMany({});
    await db.collection('warehouses').deleteMany({});
  });

  const mockUser = {
    userId: 'user1',
    organizationId: new ObjectId(),
    role: 'ContractorAdmin'
  };

  it('should mark remnant as reusable if area >= 0.1 m2', async () => {
    const warehouseId = new ObjectId();
    await db.collection('warehouses').insertOne({ _id: warehouseId, organizationId: mockUser.organizationId });

    const sheetId = new ObjectId();
    
    const large = await remnantService.create({
      sheetId: sheetId.toString(),
      warehouseId: warehouseId.toString(),
      geometryDxf: '...',
      area: 0.15 
    }, mockUser);
    expect(large.isReusable).toBe(true);

    const small = await remnantService.create({
      sheetId: sheetId.toString(),
      warehouseId: warehouseId.toString(),
      geometryDxf: '...',
      area: 0.05 
    }, mockUser);
    expect(small.isReusable).toBe(false);
  });

  it('should mark remnant as used and update warehouse', async () => {
    const warehouseId = new ObjectId();
    await db.collection('warehouses').insertOne({ _id: warehouseId, totalRemnants: 1, organizationId: mockUser.organizationId });

    const remnantId = new ObjectId();
    await db.collection('remnants').insertOne({
      _id: remnantId,
      status: 'in_stock',
      warehouseId: warehouseId
    });

    const queueId = new ObjectId();
    const result = await remnantService.markAsUsed(remnantId.toString(), queueId.toString(), mockUser);
    
    expect(result.status).toBe('used');
    expect(result.usedInQueueId.toString()).toBe(queueId.toString());

    const wh = await db.collection('warehouses').findOne({ _id: warehouseId });
    expect(wh.totalRemnants).toBe(0);
  });
});