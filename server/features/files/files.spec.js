import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as filesService from './service.js';

describe('resumable upload sessions', () => {
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
    await db.collection('files_upload_sessions').deleteMany({});
    await db.collection('files_upload_chunks').deleteMany({});
    await db.collection('files.files').deleteMany({});
    await db.collection('files.chunks').deleteMany({});
  });

  async function createSession({ size = 10, userId = 'user-1' } = {}) {
    const session = await filesService.createUploadSession(
      { fileName: 'payload.bin', mimeType: 'application/octet-stream', size },
      { userId },
      'files'
    );
    await db.collection('files_upload_sessions').updateOne(
      { _id: new ObjectId(session.uploadId) },
      { $set: { chunkSize: 4 } }
    );
    return session;
  }

  it('opens a session as open and resumes from the received chunk indexes', async () => {
    const session = await createSession();
    expect(session.status).toBe('open');
    expect((await db.collection('files_upload_sessions').findOne({ _id: new ObjectId(session.uploadId) })).status)
      .toBe('open');

    await filesService.appendUploadChunk(session.uploadId, 2, Buffer.from('89'), { userId: 'user-1' });
    await filesService.appendUploadChunk(session.uploadId, 0, Buffer.from('0123'), { userId: 'user-1' });

    await expect(filesService.getUploadSession(session.uploadId, { userId: 'user-1' })).resolves.toEqual({
      uploadId: session.uploadId,
      chunkSize: 4,
      size: 10,
      status: 'open',
      received: [0, 2]
    });
  });

  it('assembles out-of-order chunks and applies duplicate completion as a no-op', async () => {
    const session = await createSession();
    await filesService.appendUploadChunk(session.uploadId, 2, Buffer.from('89'), { userId: 'user-1' });
    await filesService.appendUploadChunk(session.uploadId, 0, Buffer.from('0123'), { userId: 'user-1' });
    await filesService.appendUploadChunk(session.uploadId, 1, Buffer.from('4567'), { userId: 'user-1' });

    const stored = await filesService.completeUploadSession(session.uploadId, { userId: 'user-1' });
    expect(await filesService.getFileBuffer(stored.id, 'files')).toEqual(Buffer.from('0123456789'));

    const duplicate = await filesService.completeUploadSession(session.uploadId, { userId: 'user-1' });
    expect(duplicate).toEqual(stored);
    expect(await db.collection('files.files').countDocuments()).toBe(1);

    const doc = await db.collection('files_upload_sessions').findOne({ _id: new ObjectId(session.uploadId) });
    expect(doc.status).toBe('completed');
    expect(doc.result).toEqual(stored);
    expect(await db.collection('files_upload_chunks').countDocuments()).toBe(0);
  });

  it('refuses completion while chunks are missing and stays open', async () => {
    const session = await createSession();
    await filesService.appendUploadChunk(session.uploadId, 0, Buffer.from('0123'), { userId: 'user-1' });
    await filesService.appendUploadChunk(session.uploadId, 2, Buffer.from('89'), { userId: 'user-1' });

    await expect(filesService.completeUploadSession(session.uploadId, { userId: 'user-1' }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect((await db.collection('files_upload_sessions').findOne({ _id: new ObjectId(session.uploadId) })).status)
      .toBe('open');
  });

  it('sweeps stale open sessions to expired and deletes their chunks', async () => {
    const session = await createSession();
    await filesService.appendUploadChunk(session.uploadId, 0, Buffer.from('0123'), { userId: 'user-1' });
    await db.collection('files_upload_sessions').updateOne(
      { _id: new ObjectId(session.uploadId) },
      { $set: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } }
    );

    await expect(filesService.sweepExpiredUploadSessions()).resolves.toBe(1);

    const doc = await db.collection('files_upload_sessions').findOne({ _id: new ObjectId(session.uploadId) });
    expect(doc.status).toBe('expired');
    expect(doc.expiredAt).toBeInstanceOf(Date);
    expect(await db.collection('files_upload_chunks').countDocuments()).toBe(0);
    await expect(filesService.completeUploadSession(session.uploadId, { userId: 'user-1' }))
      .rejects.toMatchObject({ statusCode: 410 });
  });
});

describe('HTTP file access policy', () => {
  it('requires an authenticated principal for every file read', () => {
    expect(() => filesService.assertFileReadAccess({}, null))
      .toThrow(/Authentication required/);
  });

  it('scopes organization files to the active organization or a matching membership', () => {
    const metadata = { organizationId: 'org-a', userId: 'u1' };
    expect(filesService.assertFileReadAccess(metadata, {
      userId: 'u1', organizationId: 'org-a'
    })).toBe(true);
    expect(filesService.assertFileReadAccess(metadata, {
      userId: 'u2', memberships: [{ organizationId: 'org-a' }]
    })).toBe(true);
    expect(() => filesService.assertFileReadAccess(metadata, {
      userId: 'u1', organizationId: 'org-b',
      memberships: [{ organizationId: 'org-a' }]
    })).toThrow(/File not found/);
    expect(() => filesService.assertFileReadAccess(metadata, {
      userId: 'u2', memberships: [{ organizationId: 'org-b' }]
    })).toThrow(/File not found/);
  });

  it('keeps unscoped user uploads private while allowing unowned system files', () => {
    expect(filesService.assertFileReadAccess({ userId: 'u1' }, { userId: 'u1' })).toBe(true);
    expect(() => filesService.assertFileReadAccess({ userId: 'u1' }, { userId: 'u2' }))
      .toThrow(/File not found/);
    expect(filesService.assertFileReadAccess({}, { userId: 'u2' })).toBe(true);
  });

  it('exposes only the two documented HTTP buckets', () => {
    expect(filesService.publicFileBucket(undefined)).toBe('uploads');
    expect(filesService.publicFileBucket('files')).toBe('files');
    expect(() => filesService.publicFileBucket('private')).toThrow(/Unsupported file bucket/);
  });
});
