import { GridFSBucket } from 'mongodb';
import { createHash } from 'node:crypto';
import { connectDB } from '../../db/mongo.js';
import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import * as repository from './repository.js';

// Content addressing (SPEC §28 artifact contract): every stored file
// carries its SHA-256 in GridFS metadata — one home, every bucket.
export function contentHash(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

const HTTP_FILE_BUCKETS = new Set(['uploads', 'files']);

export function publicFileBucket(value, fallback = 'uploads') {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || !HTTP_FILE_BUCKETS.has(value)) {
    throw createError({ statusCode: 400, message: 'Unsupported file bucket' });
  }
  return value;
}

// GridFS ids are references, not bearer credentials. Files carrying an
// organization belong to that organization; unscoped user uploads belong
// to their uploader; only explicitly unowned system files are shared.
export function assertFileReadAccess(metadata = {}, auth = {}) {
  if (!auth?.userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  const fileOrganizationId = metadata.organizationId?.toString?.() || null;
  if (fileOrganizationId) {
    const activeOrganizationId = auth.organizationId?.toString?.() || null;
    const isMember = (auth.memberships || []).some(
      membership => membership.organizationId?.toString?.() === fileOrganizationId
    );
    if (activeOrganizationId
      ? activeOrganizationId !== fileOrganizationId
      : !isMember) {
      throw createError({ statusCode: 404, message: 'File not found' });
    }
    return true;
  }
  const ownerId = metadata.userId?.toString?.() || null;
  if (ownerId && ownerId !== String(auth.userId)) {
    throw createError({ statusCode: 404, message: 'File not found' });
  }
  return true;
}

export async function uploadFile(fileBuffer, fileName, metadata = {}, bucketName = 'uploads', contentType = '') {
  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName });

  const uploadStream = bucket.openUploadStream(fileName, {
    metadata: {
      ...metadata,
      ...(fileBuffer?.length ? { contentHash: contentHash(fileBuffer) } : {}),
      createdAt: new Date()
    },
    // Stored content type wins inline serving (videos, images); the
    // filename extension stays the fallback in contentTypeForFile.
    ...(contentType ? { contentType } : {})
  });
  
  await new Promise((resolve, reject) => {
    uploadStream.on('finish', resolve);
    uploadStream.on('error', reject);
    uploadStream.write(fileBuffer);
    uploadStream.end();
  });
  
  return {
    id: uploadStream.id.toString(),
    filename: fileName,
    url: `/api/files/download/${uploadStream.id.toString()}?bucket=${bucketName}`
  };
}

export async function getFileStream(fileId, bucketName = 'uploads') {
  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName });

  try {
    return bucket.openDownloadStream(toFlexibleId(fileId));
  } catch (err) {
    throw createError({ statusCode: 404, message: 'File not found' });
  }
}

// Byte-range stream for media playback/seeking: `start` inclusive,
// `endInclusive` inclusive, translated to GridFS's exclusive `end`.
export async function getFileRangeStream(fileId, bucketName = 'uploads', start = 0, endInclusive = 0) {
  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName });

  try {
    return bucket.openDownloadStream(toFlexibleId(fileId), { start, end: endInclusive + 1 });
  } catch (err) {
    throw createError({ statusCode: 404, message: 'File not found' });
  }
}

// Content type resolution for inline serving: stored contentType/metadata
// win; the upload filename's extension is the fallback so declared
// previews (SVG documents, PDFs, images) render in image/iframe contexts
// that refuse sniffed or octet-stream responses.
const EXTENSION_CONTENT_TYPES = Object.freeze({
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.dxf': 'application/dxf',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.mjs': 'text/javascript',
  '.mp4': 'video/mp4',
  '.occs': 'application/perigram+occs',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.m4a': 'audio/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});

export async function findFileMeta(fileId, bucketName = 'uploads') {
  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName });
  const files = await bucket.find({ _id: toFlexibleId(fileId) }).limit(1).toArray();
  const doc = files[0] || null;
  if (!doc) return null;
  return {
    filename: String(doc.filename || ''),
    contentType: String(doc.contentType || ''),
    length: Number(doc.length) || 0,
    metadata: doc.metadata || {}
  };
}

export async function findFileMetaByFilename(filename, bucketName = 'uploads') {
  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName });
  const files = await bucket.find({ filename: String(filename || '') }).limit(1).toArray();
  const doc = files[0] || null;
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    filename: String(doc.filename || ''),
    contentType: String(doc.contentType || ''),
    length: Number(doc.length) || 0,
    metadata: doc.metadata || {}
  };
}

export async function listFileMetasWhere(bucketName = 'uploads', filter = {}) {
  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName });
  const docs = await bucket.find(filter).toArray();
  return docs.map(doc => ({
    id: doc._id.toString(),
    filename: String(doc.filename || ''),
    contentType: String(doc.contentType || ''),
    length: Number(doc.length) || 0,
    metadata: doc.metadata || {}
  }));
}

export function contentTypeForFile({ filename = '', contentType = '', metadata = {} } = {}) {
  if (contentType && contentType !== 'application/octet-stream') return contentType;
  if (metadata?.mimeType && metadata.mimeType !== 'application/octet-stream') return metadata.mimeType;
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return EXTENSION_CONTENT_TYPES[extension] || 'application/octet-stream';
}

export async function getFileBuffer(fileId, bucketName = 'uploads') {
  const stream = await getFileStream(fileId, bucketName);
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function deleteFile(fileId, bucketName = 'uploads') {
  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName });

  try {
    await bucket.delete(toFlexibleId(fileId));
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.message?.includes('FileNotFound') || err?.message?.includes('File not found')) return;
    throw err;
  }
}

// -- Resumable upload sessions --
// Big chat uploads ride chunk-append sessions instead of one request:
// the client slices the file, PUTs each chunk (idempotent per index), and
// completes; on disconnect it reads the session's received indexes and
// re-sends only the gaps. Persistence lives in the feature repository
// (chunks survive server restarts; TTL reaps abandoned sessions); this
// service owns validation and assembly. Small files keep the single
// multipart POST.

export async function createUploadSession({ fileName = '', mimeType = '', size = 0 } = {}, { userId = '', organizationId = '' } = {}, bucketName = 'files') {
  const byteCount = Number(size);
  if (!Number.isFinite(byteCount) || byteCount <= 0) {
    throw createError({ statusCode: 400, message: 'Upload session size must be a positive number of bytes' });
  }
  if (byteCount > repository.UPLOAD_SESSION_MAX_BYTES) {
    throw createError({ statusCode: 400, message: 'Upload exceeds the session size limit' });
  }
  const doc = await repository.insertUploadSession({
    fileName: String(fileName || 'file').slice(0, 200),
    mimeType: String(mimeType || '').slice(0, 100),
    size: byteCount,
    chunkSize: repository.UPLOAD_SESSION_CHUNK_SIZE,
    bucket: bucketName,
    userId: userId || null,
    organizationId: organizationId || null,
    status: 'open',
    createdAt: new Date()
  });
  return { uploadId: doc._id.toString(), chunkSize: doc.chunkSize, size: doc.size, status: doc.status };
}

export async function getUploadSession(uploadId, context = {}) {
  const doc = await repository.findUploadSession(uploadId, context);
  if (!doc) throw createError({ statusCode: 404, message: 'Upload session not found' });
  if (doc.status === 'expired') throw createError({ statusCode: 410, message: 'Upload session expired' });
  return {
    uploadId: doc._id.toString(),
    chunkSize: doc.chunkSize,
    size: doc.size,
    status: doc.status,
    received: doc.status === 'open' ? await repository.listReceivedChunkIndexes(doc._id) : []
  };
}

export async function appendUploadChunk(uploadId, index, buffer, context = {}) {
  const doc = await repository.findUploadSession(uploadId, context);
  if (!doc) throw createError({ statusCode: 404, message: 'Upload session not found' });
  if (doc.status === 'expired') throw createError({ statusCode: 410, message: 'Upload session expired' });
  if (doc.status !== 'open') throw createError({ statusCode: 409, message: 'Upload session is not open' });
  const chunkIndex = Number(index);
  const totalChunks = Math.ceil(doc.size / doc.chunkSize);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= totalChunks) {
    throw createError({ statusCode: 400, message: 'Upload chunk index out of range' });
  }
  if (!buffer?.length || buffer.length > doc.chunkSize) {
    throw createError({ statusCode: 400, message: 'Upload chunk size is invalid' });
  }
  await repository.upsertUploadChunk(doc._id, chunkIndex, buffer);
  return { index: chunkIndex };
}

export async function completeUploadSession(uploadId, context = {}) {
  const doc = await repository.findUploadSession(uploadId, context);
  if (!doc) throw createError({ statusCode: 404, message: 'Upload session not found' });
  if (doc.status === 'completed') return doc.result;
  if (doc.status === 'expired') throw createError({ statusCode: 410, message: 'Upload session expired' });
  const totalChunks = Math.ceil(doc.size / doc.chunkSize);
  const chunks = await repository.listUploadChunksSorted(doc._id);
  if (chunks.length !== totalChunks || chunks.some((chunk, position) => chunk.index !== position)) {
    throw createError({ statusCode: 400, message: 'Upload session is incomplete' });
  }
  const buffer = Buffer.concat(chunks.map(chunk => Buffer.from(chunk.data.buffer)));
  if (buffer.length !== doc.size) {
    throw createError({ statusCode: 400, message: 'Upload session byte count mismatch' });
  }
  // The assembled file stays chunked until the GridFS write succeeds — a
  // failed complete can be retried.
  const stored = await uploadFile(
    buffer,
    doc.fileName,
    { userId: doc.userId || undefined, organizationId: doc.organizationId || undefined, mimeType: doc.mimeType || undefined },
    doc.bucket,
    doc.mimeType || ''
  );
  const completed = await repository.completeUploadSession(doc._id, stored);
  if (completed) return completed.result;
  const current = await repository.findUploadSession(uploadId, context);
  return current?.result || stored;
}

export async function sweepExpiredUploadSessions(now = new Date()) {
  return await repository.sweepExpiredUploadSessions(now);
}
