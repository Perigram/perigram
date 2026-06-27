import { connectDB } from '../db/mongo.js';
import {
  normalizeOccsProfileSketch,
  occsProfileFromSketch
} from '../../utils/occs/profiles.js';

const DRY_RUN = process.argv.includes('--dry-run');

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function migrateProfileTemplateFilletData(profile = {}) {
  const data = profile.data || {};
  const sketch = normalizeOccsProfileSketch(data.sketch || {}, data.parameters || {});
  const occsProfile = occsProfileFromSketch(sketch, { parameters: data.parameters || {} });
  const nextData = {
    ...data,
    sketch,
    occsProfile
  };
  return {
    changed: !sameJson(data.sketch, sketch) || !sameJson(data.occsProfile, occsProfile),
    data: nextData
  };
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('profile_templates').find({
    $or: [
      { 'data.sketch.modifiers.vertices': { $exists: true } },
      { 'data.occsProfile.section.modifiers.vertices': { $exists: true } }
    ]
  });
  let scanned = 0;
  let updated = 0;

  for await (const profile of cursor) {
    scanned++;
    const migrated = migrateProfileTemplateFilletData(profile);
    if (!migrated.changed) continue;
    updated++;
    if (!DRY_RUN) {
      await db.collection('profile_templates').updateOne(
        { _id: profile._id },
        { $set: { data: migrated.data, updatedAt: new Date() } }
      );
    }
  }

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Scanned ${scanned} profile templates; updated ${updated}.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
