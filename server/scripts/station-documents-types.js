import { connectDB } from '../db/mongo.js';
import { randomBytes } from 'node:crypto';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '../../packages/cts/src/index.js';
import documentsListing from '../../workers/documents/listing.json' with { type: 'json' };
import techDrawingListing from '../../workers/tech-drawing/listing.json' with { type: 'json' };
import { createDefinitionAuthoring } from '../../packages/processes/src/authoring.js';

/**
 * Stations the mounted packs' starter constructs (the documents pack's
 * markdown-first set, the documents plugin listing) into
 * organizations' processes as an additive ACTIVE definition — the same
 * headless authoring seam the designer, the e2e fixtures, and the
 * org-creation starter use (createDefinitionAuthoring), posted through
 * the real definition API so validation, compilation, and activation
 * run exactly as in the browser. Existing definitions are never
 * touched: activation is additive (the union of every ACTIVE
 * definition's compiled actions). New organizations carry the starters
 * from creation; this script repairs organizations created before that.
 *
 * Usage:
 *   node server/scripts/station-documents-types.js [--dry-run] [--org <id> ...]
 * Without --org, every org holding an ACTIVE definition is processed.
 */

const TYPES = documentsListing.declarations.starterConstructs;
const STARTER_LABELS = TYPES.map(construct => `${construct.typeId}:${construct.construction}`);
const dryRun = process.argv.includes('--dry-run');
const orgArgs = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--org' && process.argv[i + 1]) orgArgs.push(process.argv[++i]);
  else if (process.argv[i].startsWith('--org=')) orgArgs.push(process.argv[i].slice(6));
}
const APP = process.env.APP_URL || 'http://localhost:3000';

const db = await connectDB();

function definitionData(organizationId) {
  const registry = createTypeRegistry({ id: 'station-documents' });
  for (const declaration of [...frameworkTypes, ...documentsListing.declarations.types, ...techDrawingListing.declarations.types]) {
    registry.defineType(declaration);
  }
  const domain = projectDomainFromView(registry, organizationId, [], {
    packServices: [...(documentsListing.declarations.services || []), ...(techDrawingListing.declarations.services || [])]
  });
  const authoring = createDefinitionAuthoring(domain);
  TYPES.forEach((construct, index) => {
    const id = `documents-${index}`;
    authoring.drop('construct', { id, typeId: construct.typeId });
    authoring.configure(id, {
      construction: { mode: construct.construction },
      access: { level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] }
    });
  });
  return authoring.definition();
}

const activeDefs = await db.collection('process_definitions').find({
  ...(orgArgs.length ? { 'lineage.organizationId': { $in: orgArgs } } : {}),
  'states.main': 'ACTIVE'
}).toArray();

const byOrg = new Map();
for (const def of activeDefs) {
  const orgId = String(def.lineage?.organizationId || '');
  if (!orgId) continue;
  if (!byOrg.has(orgId)) byOrg.set(orgId, []);
  byOrg.get(orgId).push(def);
}
if (orgArgs.length) {
  for (const orgId of orgArgs) if (!byOrg.has(orgId)) byOrg.set(orgId, []);
}

const minted = [];
const results = [];
for (const [orgId, defs] of byOrg) {
  const ownerUserId = defs.find(def => def.states?.userId)?.states.userId
    // Activate requires the acting user's ACTIVE organization to be this
    // org: prefer an active-scoped member; a lineage/membership-only
    // user is authoritative nowhere here.
    || (await db.collection('users').findOne({
      organizationId: orgId,
      isActive: { $ne: false }
    }, { sort: { _id: 1 } }))?._id
    || (await db.collection('users').findOne({
      $or: [{ 'lineage.organizationId': orgId }, { 'memberships.organizationId': orgId }],
      isActive: { $ne: false }
    }, { sort: { _id: 1 } }))?._id;
  if (!ownerUserId) {
    results.push(`${orgId}: SKIPPED (no owner user found)`);
    continue;
  }
  if (dryRun) {
    results.push(`${orgId}: would station ${STARTER_LABELS.join(', ')} as user ${ownerUserId}`);
    continue;
  }
  const sessionId = randomBytes(24).toString('hex');
  await db.collection('sessions').insertOne({
    sessionId,
    userId: String(ownerUserId),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000)
  });
  minted.push(sessionId);
  try {
    const headers = { 'content-type': 'application/json', cookie: `sessionId=${sessionId}` };
    const draft = await fetch(`${APP}/api/process-definitions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Documents', data: definitionData(orgId) })
    });
    if (!draft.ok) throw new Error(`draft ${draft.status}: ${(await draft.text()).slice(0, 200)}`);
    const created = await draft.json();
    const activate = await fetch(`${APP}/api/process-definitions/${created._id}/activate`, { method: 'POST', headers });
    if (!activate.ok) throw new Error(`activate ${activate.status}: ${(await activate.text()).slice(0, 200)}`);
    results.push(`${orgId}: STATIONED ${STARTER_LABELS.join(', ')} (definition ${created._id}, user ${ownerUserId})`);
  } catch (error) {
    results.push(`${orgId}: FAILED (${error.message})`);
  }
}

if (minted.length) {
  await db.collection('sessions').deleteMany({ sessionId: { $in: minted } });
}
console.log(results.join('\n') || 'No organizations with ACTIVE definitions found.');
process.exit(0);
