import { connectDB } from '../db/mongo.js';

/**
 * One-shot migration completing the sheet-material pack-type removal.
 * The type left the facade pack (the pack keeps only evaluation
 * semantics; flow vocabulary is declared in-tree), but persisted
 * definitions in orgs that authored against the pack type still
 * reference the id — construct binds, field reads, and org declaration
 * children edges. Every org whose stored data references sheet-material
 * gets the org-scoped declaration in cts_types, so those definitions
 * and declarations resolve again. Idempotent: orgs that already carry
 * the declaration are reported, never overwritten.
 *
 * Usage: node server/scripts/migrate-sheet-material-org-vocabulary.js [--dry-run]
 */

const TYPE_ID = 'sheet-material';

const DECLARATION = {
    id: TYPE_ID,
    scope: 'org',
    class: 'file',
    name: 'Sheet material',
    fields: {
        code: { base: 'string', identifier: true },
        width: { base: 'quantity', unit: 'mm' },
        height: { base: 'quantity', unit: 'mm' },
        thickness: { base: 'quantity', unit: 'mm' }
    }
};

const dryRun = process.argv.includes('--dry-run');
const db = await connectDB();

const orgs = new Set();
for (const definition of await db.collection('process_definitions').find({}).toArray()) {
    if (JSON.stringify(definition).includes(TYPE_ID) && definition.lineage?.organizationId) {
        orgs.add(String(definition.lineage.organizationId));
    }
}
for (const declaration of await db.collection('cts_types').find({}).toArray()) {
    if (declaration.id !== TYPE_ID && JSON.stringify(declaration).includes(TYPE_ID)
        && declaration.organizationId) {
        orgs.add(String(declaration.organizationId));
    }
}

if (!orgs.size) {
    console.log(`No stored data references ${TYPE_ID}; nothing to migrate.`);
    process.exit(0);
}

for (const org of orgs) {
    const existing = await db.collection('cts_types').findOne({ id: TYPE_ID, organizationId: org });
    if (existing) {
        console.log(`[${org}] already declares ${TYPE_ID}; skipped`);
        continue;
    }
    if (dryRun) {
        console.log(`[${org}] would insert the ${TYPE_ID} declaration`);
        continue;
    }
    await db.collection('cts_types').insertOne({ ...DECLARATION, organizationId: org });
    console.log(`[${org}] inserted the ${TYPE_ID} declaration`);
}
console.log(dryRun ? 'Dry run complete.' : 'Migration complete.');
process.exit(0);
