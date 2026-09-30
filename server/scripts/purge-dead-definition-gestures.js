import { connectDB } from '../db/mongo.js';

/**
 * One-shot repair: removes dead authoring gestures from stored process
 * definitions — construct records whose only graph edges are binds wires
 * (dropped, type-bound, never wired into the flow) and typeRef records
 * whose only edges bind those dead constructs. Live records are never
 * touched: a construct with any non-binds edge (data, control, trigger)
 * stays, and a typeRef that feeds targets/children edges or binds a live
 * construct stays. Removal deletes the record, its canvas node, and its
 * binds edges — nothing else.
 *
 * Usage: node server/scripts/purge-dead-definition-gestures.js [--apply]
 */

const BIND_TARGET = 'data:type';

const dryRun = !process.argv.includes('--apply');
const db = await connectDB();

function isBindsEdgeInto(edge, nodeId) {
    return String(edge.target) === nodeId
        && String(edge.targetHandle || '') === BIND_TARGET
        && String(edge.sourceHandle || '') === 'output:type';
}

let removedRecords = 0;
let removedEdges = 0;
let removedNodes = 0;

for (const definition of await db.collection('process_definitions').find({}).toArray()) {
    const data = definition.data;
    if (!data?.processNodes || !data?.graph?.edges) continue;

    const edges = data.graph.edges;
    // Canvas node ids are usually the record id, but the projection may
    // namespace a twin (shared id) — resolve every endpoint to its record
    // id (data.refId) so the dead analysis is never fooled by a canvas alias.
    const canvasIdToRefId = new Map();
    for (const node of data.graph.nodes || []) {
        const refId = node?.data?.refId ? String(node.data.refId) : null;
        if (refId) canvasIdToRefId.set(String(node.id), refId);
    }
    const refIdOf = endpoint => canvasIdToRefId.get(String(endpoint)) || String(endpoint);
    const touching = nodeId => edges.filter(edge =>
        refIdOf(edge.source) === nodeId || refIdOf(edge.target) === nodeId);

    const deadConstructs = Object.keys(data.processNodes).filter(nodeId => {
        const record = data.processNodes[nodeId];
        if (record?.kind !== 'cts.construct') return false;
        const nodeEdges = touching(nodeId);
        if (!nodeEdges.length) return !record.typeId;
        return nodeEdges.every(edge => isBindsEdgeInto(edge, nodeId));
    });
    const deadTypeRefs = Object.keys(data.ctsTypes || {}).filter(refId => {
        const record = data.ctsTypes[refId];
        if (record?.kind !== 'type') return false;
        const nodeEdges = touching(refId);
        return nodeEdges.length > 0 && nodeEdges.every(edge =>
            String(edge.source) === refId
            && deadConstructs.includes(String(edge.target)));
    });

    const dead = new Set([...deadConstructs, ...deadTypeRefs]);
    if (!dead.size) continue;

    const label = definition.identity?.name || definition._id;
    for (const nodeId of dead) {
        const home = deadConstructs.includes(nodeId) ? 'processNodes' : 'ctsTypes';
        console.log(`[${label}] remove ${home}.${nodeId}`);
        removedRecords += 1;
    }
    const keptEdges = edges.filter(edge => !dead.has(String(edge.target)) || !isBindsEdgeInto(edge, edge.target));
    removedEdges += edges.length - keptEdges.length;
    const keptNodes = (data.graph.nodes || []).filter(node => !dead.has(String(node.id)));
    removedNodes += (data.graph.nodes || []).length - keptNodes.length;

    if (dryRun) continue;

    const nextEdges = data.graph.edges.filter(edge =>
        !(dead.has(String(edge.target)) && isBindsEdgeInto(edge, edge.target)));
    const nextNodes = (data.graph.nodes || []).filter(node => !dead.has(String(node.id)));
    const nextProcessNodes = { ...data.processNodes };
    for (const nodeId of deadConstructs) delete nextProcessNodes[nodeId];
    const nextCtsTypes = { ...(data.ctsTypes || {}) };
    for (const refId of deadTypeRefs) delete nextCtsTypes[refId];

    await db.collection('process_definitions').updateOne({ _id: definition._id }, { $set: {
        'data.processNodes': nextProcessNodes,
        'data.ctsTypes': nextCtsTypes,
        'data.graph.edges': nextEdges,
        'data.graph.nodes': nextNodes
    } });
}

console.log(`${dryRun ? 'Dry run' : 'Applied'}: ${removedRecords} dead records, ${removedEdges} binds edges, ${removedNodes} canvas nodes.`);
process.exit(0);
