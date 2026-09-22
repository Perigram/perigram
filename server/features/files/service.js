import { GridFSBucket, ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';

export async function uploadFile(fileBuffer, fileName, metadata = {}, bucketName = 'uploads') {
  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName });
  
  const uploadStream = bucket.openUploadStream(fileName, {
    metadata: { 
      ...metadata,
      createdAt: new Date()
    }
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

// Content type resolution for inline serving: stored contentType/metadata
// win; the upload filename's extension is the fallback so declared
// previews (SVG documents, PDFs, images) render in image/iframe contexts
// that refuse sniffed or octet-stream responses.
const EXTENSION_CONTENT_TYPES = Object.freeze({
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.dxf': 'application/dxf',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.occs': 'application/perigram+occs',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
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
    metadata: doc.metadata || {}
  };
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
