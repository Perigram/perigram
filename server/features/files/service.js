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
