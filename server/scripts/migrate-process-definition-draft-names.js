import { connectDB } from '../db/mongo.js';
import { normalizePersistedProcessName } from '../../utils/processDesignerDisplay.js';

const apply = process.env.APPLY === '1';

async function main() {
  const db = await connectDB();
  const processes = await db.collection('process_definitions')
    .find({}, { projection: { 'identity.name': 1 } })
    .toArray();
  const changes = processes
    .map(process => ({
      process,
      name: normalizePersistedProcessName(process.identity?.name)
    }))
    .filter(({ process, name }) => name && name !== process.identity?.name);

  if (apply) {
    for (const { process, name } of changes) {
      await db.collection('process_definitions').updateOne(
        { _id: process._id },
        { $set: { 'identity.name': name } }
      );
    }
  }

  console.log(`${apply ? 'Updated' : 'Would update'} ${changes.length} process definition names.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
