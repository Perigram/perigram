import { connectDB } from '../db/mongo.js';

/**
 * One-shot restitution completing the owner's order: sheet-material
 * vocabulary lives ONLY as user-authored nodes inside definitions — never
 * in the facade pack, never in org registries.
 *
 * 1. Every stored definition with an authored declaration tree that
 *    references sheet-material through a typeRef gets the reference
 *    CONVERTED to an in-tree class node (materialClass + its four
 *    fields), edges and canvas node rewired — the exact gesture the
 *    designer authors.
 * 2. Stored org declarations that still name sheet-material in children
 *    edges are stripped of the id (the next Apply re-posts them from the
 *    definition's own tree).
 * 3. The org-registry sheet-material declarations are deleted.
 * 4. Definitions referencing sheet-material with NO authored tree (the
 *    rejected pseudo-definition seeds, source deleted 2026-09-29) are
 *    deleted with a loud report.
 *
 * Usage: node server/scripts/migrate-sheet-material-in-tree.js [--apply]
 */

const TYPE_ID = 'sheet-material';
const CLASS_ID = 'materialClass';

const FIELDS = [
    ['materialCodeField', 'code', { base: 'string', identifier: true }],
    ['materialWidthField', 'width', { base: 'quantity', unit: 'mm' }],
    ['materialHeightField', 'height', { base: 'quantity', unit: 'mm' }],
    ['materialThicknessField', 'thickness', { base: 'quantity', unit: 'mm' }]
];

const dryRun = !process.argv.includes('--apply');
const db = await connectDB();

function materialClassRecord(typeRef) {
    return {
        id: CLASS_ID,
        kind: 'class',
        typeId: TYPE_ID,
        name: 'Sheet material',
        class: 'file',
        glyph: null,
        payload: null,
        operators: [],
        idCustom: false,
        ...(typeRef.idCustom ? { idCustom: true } : {})
    };
}

const definitions = (await db.collection('process_definitions').find({}).toArray())
    .filter(definition => JSON.stringify(definition).includes(TYPE_ID));

for (const definition of definitions) {
    const label = definition.identity?.name || definition._id;
    const data = definition.data;
    const tree = data?.ctsTypes || {};
    const refs = Object.values(tree).filter(record => record?.kind === 'type' && record.typeId === TYPE_ID);

    if (!Object.keys(tree).length) {
        console.log(`[${label}] no authored tree — rejected seed; ${dryRun ? 'would delete' : 'DELETING'} the definition`);
        if (!dryRun) await db.collection('process_definitions').deleteOne({ _id: definition._id });
        continue;
    }
    if (!refs.length) {
        console.log(`[${label}] references ${TYPE_ID} but carries no typeRef for it — left untouched, inspect by hand`);
        continue;
    }
    const typeRef = refs[0];
    const refId = typeRef.id;

    const nextTree = { ...tree };
    delete nextTree[refId];
    nextTree[CLASS_ID] = materialClassRecord(typeRef);
    for (const [id, name, descriptor] of FIELDS) {
        nextTree[id] = { id, kind: 'field', typeId: TYPE_ID, name, descriptor };
    }

    const edges = (data.graph?.edges || []).map(edge => ({
        ...edge,
        source: String(edge.source) === refId ? CLASS_ID : edge.source,
        target: String(edge.target) === refId ? CLASS_ID : edge.target
    }));

    const nodes = (data.graph?.nodes || []).map(node => {
        if (String(node.id) !== refId) return node;
        return { ...node, id: CLASS_ID, type: 'ctsClass', data: { ...node.data, refId: CLASS_ID } };
    });

    console.log(`[${label}] typeRef ${refId} → in-tree class ${CLASS_ID} (+4 fields), ${edges.length} edges, ${nodes.length} nodes`);
    if (dryRun) continue;
    await db.collection('process_definitions').updateOne({ _id: definition._id }, { $set: {
        'data.ctsTypes': nextTree,
        'data.graph.edges': edges,
        'data.graph.nodes': nodes
    } });
}

// 2. strip the id from stored org declarations' children edges
let stripped = 0;
for (const declaration of await db.collection('cts_types').find({ id: { $ne: TYPE_ID } }).toArray()) {
    const original = JSON.stringify(declaration);
    if (!original.includes(TYPE_ID)) continue;
    const edges = declaration.edges || {};
    let changed = false;
    for (const key of Object.keys(edges.children || {})) {
        const types = edges.children[key]?.types;
        if (Array.isArray(types) && types.includes(TYPE_ID)) {
            edges.children[key].types = types.filter(type => type !== TYPE_ID);
            changed = true;
        }
    }
    if (!changed) {
        console.log(`[${declaration.id}] references ${TYPE_ID} outside children edges — left, inspect by hand`);
        continue;
    }
    stripped += 1;
    console.log(`[cts_types ${declaration.id}] children edges: ${TYPE_ID} stripped`);
    if (!dryRun) await db.collection('cts_types').updateOne({ _id: declaration._id }, { $set: { edges } });
}

// 3. delete the injected registry declarations
const registry = await db.collection('cts_types').countDocuments({ id: TYPE_ID });
console.log(`registry ${TYPE_ID} declarations: ${dryRun ? 'would delete' : 'deleting'} ${registry}`);
if (!dryRun) await db.collection('cts_types').deleteMany({ id: TYPE_ID });

console.log(`${dryRun ? 'Dry run' : 'Applied'}: definitions migrated above, ${stripped} org declarations stripped, ${registry} registry declarations removed.`);
process.exit(0);
