import { connectDB } from '../db/mongo.js';

export async function normalizeQueueJobItemEntityTypes(item = {}, resolvers = {}) {
  const id = item.id || item.cassetteDesignId || item.designId || item.cassetteTemplateId || '';
  const entityType = item.entityType
    || (item.cassetteDesignId || item.designId ? 'cassette_design' : '')
    || (item.cassetteTemplateId ? 'cassette' : '')
    || await resolveEntityType(id, resolvers);
  return {
    ...item,
    id,
    ...(entityType ? { entityType } : {}),
    quantity: Number(item.quantity || item.count || 1),
    parameters: item.parameters || item.dimensions || {}
  };
}

async function resolveEntityType(id, { hasCassetteDesign, hasCassette } = {}) {
  if (!id) return '';
  if (await hasCassetteDesign?.(id)) return 'cassette_design';
  if (await hasCassette?.(id)) return 'cassette';
  return '';
}

async function main() {
  const db = await connectDB();
  const resolvers = {
    hasCassetteDesign: async (id) => Boolean(await db.collection('cassette_designs').findOne({ _id: id }, { projection: { _id: 1 } })),
    hasCassette: async (id) => Boolean(await db.collection('cassettes').findOne({ _id: id }, { projection: { _id: 1 } }))
  };

  const cursor = db.collection('queues').find({ 'data.job.items.0': { $exists: true } });
  let scanned = 0;
  let updated = 0;

  for await (const queue of cursor) {
    scanned++;
    const items = queue.data?.job?.items || [];
    const normalizedItems = [];
    for (const item of items) {
      normalizedItems.push(await normalizeQueueJobItemEntityTypes(item, resolvers));
    }
    if (JSON.stringify(items) === JSON.stringify(normalizedItems)) continue;

    await db.collection('queues').updateOne(
      { _id: queue._id },
      { $set: { 'data.job.items': normalizedItems } }
    );
    updated++;
  }

  console.log(`Scanned ${scanned} queues; normalized ${updated}.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
