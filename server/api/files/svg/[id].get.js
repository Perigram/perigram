import { connectDB } from '~/server/db/mongo';
import { GridFSBucket, ObjectId } from 'mongodb';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    });
  }

  const fileId = getRouterParam(event, 'id');
  
  if (!ObjectId.isValid(fileId)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid file ID'
    });
  }

  const db = await connectDB();
  const cassetteSvgBucket = new GridFSBucket(db, { bucketName: 'cassetteSvg' });

  try {
    // Find file by _id
    const files = await cassetteSvgBucket
      .find({ _id: new ObjectId(fileId) })
      .toArray();

    if (!files || files.length === 0) {
      throw createError({
        statusCode: 404,
        message: 'SVG not found'
      });
    }

    const file = files[0];

    // Check ownership
    if (file.metadata?.userId !== userId && !event.context.auth?.isAdmin) {
      throw createError({
        statusCode: 403,
        message: 'Access denied'
      });
    }

    // Stream the file
    const readStream = cassetteSvgBucket.openDownloadStream(new ObjectId(fileId));

    setResponseHeaders(event, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400'
    });

    return readStream;
  } catch (error) {
    if (error.statusCode) throw error;
    
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch SVG file'
    });
  }
});
