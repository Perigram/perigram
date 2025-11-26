/**
 * System Settings Repository
 * Global system configuration
 */

import { connectDB } from '../../db/mongo.js';

export async function getSetting(key) {
  const db = await connectDB();
  const setting = await db.collection('system_settings').findOne({ key });
  return setting?.value ?? null;
}

export async function setSetting(key, value) {
  const db = await connectDB();
  await db.collection('system_settings').updateOne(
    { key },
    { $set: { key, value, updatedAt: new Date() } },
    { upsert: true }
  );
  return { key, value };
}

export async function getAllSettings() {
  const db = await connectDB();
  const settings = await db.collection('system_settings').find({}).toArray();
  return Object.fromEntries(settings.map(s => [s.key, s.value]));
}
