/**
 * Sync cassettes to user_dxf_files for old worker compatibility
 * 
 * The worker from ghcr.io/vovastelmashchuk expects:
 * - Collection: user_dxf_files (not cassettes)
 * - GridFS bucket: userDxf (not cassettes)
 * 
 * This script syncs data from new schema to old schema.
 */

import { connectDB } from '../db/mongo.js';
import { GridFSBucket } from 'mongodb';

async function syncCassettesToOldSchema() {
  const db = await connectDB();
  
  console.log('Syncing cassettes to user_dxf_files...');
  
  const cassettes = await db.collection('cassettes').find({}).toArray();
  const cassetteBucket = new GridFSBucket(db, { bucketName: 'cassettes' });
  const userDxfBucket = new GridFSBucket(db, { bucketName: 'userDxf' });
  
  for (const cassette of cassettes) {
    // 1. Sync document to user_dxf_files collection
    await db.collection('user_dxf_files').updateOne(
      { slug: cassette.slug },
      { $set: cassette },
      { upsert: true }
    );
    
    // 2. Sync DXF file to userDxf bucket (if not already there)
    if (cassette.dxfId) {
      const existingFile = await db.collection('userDxf.files').findOne({
        filename: cassette.slug
      });
      
      if (!existingFile) {
        // Copy file metadata
        const srcFile = await db.collection('cassettes.files').findOne({
          _id: cassette.dxfId
        });
        
        if (srcFile) {
          // Copy file metadata
          await db.collection('userDxf.files').insertOne({
            _id: srcFile._id,
            filename: cassette.slug,
            length: srcFile.length,
            chunkSize: srcFile.chunkSize,
            uploadDate: srcFile.uploadDate,
            metadata: srcFile.metadata
          });
          
          // Copy chunks
          const chunks = await db.collection('cassettes.chunks')
            .find({ files_id: cassette.dxfId })
            .toArray();
          
          if (chunks.length > 0) {
            await db.collection('userDxf.chunks').insertMany(chunks);
          }
          
          console.log(`✓ Copied DXF for: ${cassette.name}`);
        }
      }
    }
  }
  
  console.log(`✓ Synced ${cassettes.length} cassettes`);
}

syncCassettesToOldSchema()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
