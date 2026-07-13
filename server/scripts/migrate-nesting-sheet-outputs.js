import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { createData, createIdentity, createSpecs, createStatus, inheritLineage } from '../core/blocks/index.js';

async function main() {
  const db = await connectDB();
  const cursor = db.collection('nesting_runs').find({ 'data.sheetDesignIds.0': { $exists: true } });
  let updated = 0;
  for await (const run of cursor) {
    const outputs = [];
    for (const [index, designId] of run.data.sheetDesignIds.entries()) {
      const design = await db.collection('sheet_designs').findOne({ _id: flexibleId(designId) });
      if (!design) continue;
      const instanceId = new ObjectId();
      const origin = createStatus('PLANNED', 'SYSTEM', { note: 'Migrated planned sheet instance' });
      await db.collection('sheet_instances').insertOne({
        _id: instanceId,
        identity: createIdentity(`${design.identity?.name || 'Sheet'} #1`, '', '', '', `sheet-instance-${instanceId}`),
        origin,
        status: origin,
        lineage: inheritLineage(design, 'sheetDesign', value => value, design.data?.revisions?.geometry?.currentId || null),
        specs: createSpecs(design.specs || {}),
        data: createData({ sheetDesignId: design._id, layoutHash: design.data?.layoutHash || '', sequence: 1, physicalSheetId: null })
      });
      outputs.push({
        sheetDesignId: design._id.toString(),
        layoutHash: design.data?.layoutHash || `legacy:${index + 1}`,
        quantity: 1,
        sheetInstanceIds: [instanceId.toString()]
      });
    }
    const data = { ...(run.data || {}), sheetDesignOutputs: outputs };
    delete data.sheetDesignIds;
    await db.collection('nesting_runs').updateOne({ _id: run._id }, { $set: { data } });
    updated += 1;
  }
  console.log(`Migrated ${updated} nesting runs to sheet design outputs.`);
  process.exit(0);
}

function flexibleId(value) {
  try {
    return ObjectId.isValid(value) ? new ObjectId(value) : value;
  } catch {
    return value;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
