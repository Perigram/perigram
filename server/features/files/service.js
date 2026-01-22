import { GridFSBucket, ObjectId } from 'mongodb';
import { connectDB } from '~/server/db/mongo';
import { createError } from 'h3';

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
    return bucket.openDownloadStream(new ObjectId(fileId));
  } catch (err) {
    throw createError({ statusCode: 404, message: 'File not found' });
  }
}
