/**
 * Test endpoint to check baked cassettes
 * GET /api/test-bake
 */

import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

export default defineEventHandler(async (event) => {
  const db = await connectDB();
  
  const cassettesCount = await db.collection('cassettes').countDocuments();
  const bakedCount = await db.collection('baked_cassettes').countDocuments();
  
  const recentBaked = await db.collection('baked_cassettes')
    .find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();
  
  // Check specific ID from error
  const specificId = '696c96ab75517cc77d3a63e4';
  let found = null;
  try {
    const inBaked = await db.collection('baked_cassettes').findOne({ 
      _id: new ObjectId(specificId) 
    });
    if (inBaked) {
      found = { location: 'baked_cassettes', data: inBaked };
    } else {
      const inCassettes = await db.collection('cassettes').findOne({ 
        _id: new ObjectId(specificId) 
      });
      if (inCassettes) {
        found = { location: 'cassettes', data: inCassettes };
      }
    }
  } catch (e) {
    found = { error: e.message };
  }
  
  return {
    cassettesCount,
    bakedCount,
    recentBaked: recentBaked.map(b => ({
      id: b._id.toString(),
      name: b.name,
      createdAt: b.createdAt,
      expiresAt: b.expiresAt
    })),
    specificLookup: {
      id: specificId,
      found
    }
  };
});
