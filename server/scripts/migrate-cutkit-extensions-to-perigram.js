import { connectDB } from '../db/mongo.js';
import { GridFSBucket } from 'mongodb';

/**
 * One-shot migration for the CutKit → Perigram rename. Persisted entity
 * payloads keep authoring extensions under `extensions.cutkit` (cassette
 * graph trees, joint drivers, nodi inputs); every runtime seam now reads
 * `extensions.perigram`. This script renames the key at any document depth
 * in every non-system collection, and inside GridFS file contents — an
 * uploaded cassette `.occs` document carries the same legacy key in its
 * JSON. Documents that already carry both keys keep `extensions.perigram`
 * as-is and are reported, never overwritten.
 *
 * Usage: node server/scripts/migrate-cutkit-extensions-to-perigram.js [--dry-run]
 */

const dryRun = process.argv.includes('--dry-run');
const db = await connectDB();

// Returns { value, changed } — pure deep transform; only a `cutkit` key
// whose parent object is `extensions` is renamed, and only when no
// `perigram` sibling already exists.
function renameCutkitExtensions(node, stats) {
    if (Array.isArray(node)) {
        let changed = false;
        const next = node.map(item => {
            const result = renameCutkitExtensions(item, stats);
            changed = changed || result.changed;
            return result.value;
        });
        return { value: changed ? next : node, changed };
    }
    if (!node || typeof node !== 'object') return { value: node, changed: false };
    let changed = false;
    const next = {};
    for (const [key, child] of Object.entries(node)) {
        if (key === 'extensions' && child && typeof child === 'object' && !Array.isArray(child)) {
            const hasLegacy = Object.hasOwn(child, 'cutkit');
            const hasCurrent = Object.hasOwn(child, 'perigram');
            if (hasLegacy && hasCurrent) {
                stats.conflicts += 1;
            } else if (hasLegacy) {
                const { cutkit, ...rest } = child;
                next[key] = { ...rest, perigram: cutkit };
                changed = true;
                continue;
            }
        }
        const result = renameCutkitExtensions(child, stats);
        changed = changed || result.changed;
        next[key] = result.value;
    }
    return { value: changed ? next : node, changed };
}

const collections = (await db.listCollections().toArray()).map(c => c.name)
    .filter(name => !name.startsWith('system.'));

let totalRenamed = 0;
let totalConflicts = 0;
for (const name of collections) {
    const stats = { conflicts: 0 };
    let renamed = 0;
    for await (const doc of db.collection(name).find({})) {
        const { value, changed } = renameCutkitExtensions(doc, stats);
        if (!changed) continue;
        if (!dryRun) {
            await db.collection(name).replaceOne({ _id: doc._id }, value);
        }
        renamed += 1;
    }
    if (renamed || stats.conflicts) {
        console.log(`${name}: ${renamed} document(s) renamed${stats.conflicts ? `, ${stats.conflicts} conflict(s) kept as perigram` : ''}`);
    }
    totalRenamed += renamed;
    totalConflicts += stats.conflicts;
}

// GridFS file CONTENT carries the same authoring extensions (an uploaded
// cassette `.occs` document keeps `extensions.cutkit.graphTree`), and the
// collection pass above only rewrote metadata documents — the chunks were
// never touched. Every bucket is scanned: JSON-parseable files transform
// through the same deep rename and are rewritten under their original id
// (filename, contentType, and metadata preserved); anything that does not
// parse as JSON (images, binary payloads) is skipped untouched.
async function downloadFile(bucket, id) {
    const chunks = [];
    await new Promise((resolve, reject) => {
        const stream = bucket.openDownloadStream(id);
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
    });
    return Buffer.concat(chunks);
}

let filesRenamed = 0;
const bucketNames = [...new Set(collections.filter(name => name.endsWith('.files')).map(name => name.slice(0, -'.files'.length)))];
for (const bucketName of bucketNames) {
    const bucket = new GridFSBucket(db, { bucketName });
    let renamed = 0;
    const cursor = db.collection(`${bucketName}.files`).find({}, { projection: { _id: 1, filename: 1, contentType: 1, metadata: 1, length: 1 } });
    for await (const file of cursor) {
        let document = null;
        try {
            document = JSON.parse((await downloadFile(bucket, file._id)).toString('utf8'));
        } catch {
            continue;
        }
        const stats = { conflicts: 0 };
        const { value, changed } = renameCutkitExtensions(document, stats);
        if (!changed) continue;
        if (!dryRun) {
            const nextContent = Buffer.from(JSON.stringify(value), 'utf8');
            await bucket.delete(file._id);
            await new Promise((resolve, reject) => {
                const stream = bucket.openUploadStreamWithId(file._id, file.filename, {
                    contentType: file.contentType,
                    metadata: file.metadata
                });
                stream.on('error', reject);
                stream.end(nextContent, resolve);
            });
        }
        renamed += 1;
    }
    if (renamed) console.log(`${bucketName} (GridFS content): ${renamed} file(s) renamed`);
    filesRenamed += renamed;
}

console.log(`migrate-cutkit-extensions-to-perigram: ${totalRenamed} document(s) across ${collections.length} collection(s), ${filesRenamed} GridFS file(s), ${totalConflicts} conflict(s)${dryRun ? ' (dry run)' : ''}`);
process.exit(0);
