import { connectDB } from '../db/mongo.js';
import { randomBytes } from 'node:crypto';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '../../packages/cts/src/index.js';
import documentsListing from '../../workers/documents/listing.json' with { type: 'json' };
import { createDefinitionAuthoring } from '../../packages/processes/src/authoring.js';

/**
 * Seeds the SPEC §24 markdown template-fill example: a value.format
 * template fed by a record list into a text-document content construct,
 * activated additively through the real definition API, plus one filled
 * instance so the example is visible on the org's screens. The construct
 * lane goes to the role held by the org's earliest assigned member.
 *
 * Usage:
 *   node server/scripts/seed-template-fill-example.js [--dry-run] [--org <id> ...]
 * Without --org, every org holding an ACTIVE definition and the documents
 * plugin install is processed. Idempotent: orgs already holding the named
 * definition skip.
 */

const DEFINITION_NAME = 'Template fill — markdown passport';
const INSTANCE_NAME = 'Cutting pass — Demo Facade';

const dryRun = process.argv.includes('--dry-run');
const orgArgs = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--org' && process.argv[i + 1]) orgArgs.push(process.argv[++i]);
  else if (process.argv[i].startsWith('--org=')) orgArgs.push(process.argv[i].slice(6));
}
const APP = process.env.APP_URL || 'http://localhost:3000';

const db = await connectDB();

function templateFillData(organizationId, roleId) {
  const registry = createTypeRegistry({ id: 'seed-template-fill' });
  for (const declaration of [...frameworkTypes, ...documentsListing.declarations.types]) {
    registry.defineType(declaration);
  }
  const domain = projectDomainFromView(registry, organizationId, [], {
    packServices: [...(documentsListing.declarations.services || [])]
  });
  const authoring = createDefinitionAuthoring(domain);
  authoring.drop('literalList', { id: 'src' });
  authoring.configure('src', {
    type: { base: 'record', nullable: false },
    value: [{ project: 'Demo Facade', code: 'E-219' }]
  });
  authoring.drop('formatValue', { id: 'fmt' });
  authoring.configure('fmt', {
    template: '# Cutting pass — {project}\n\nOrder code: {code}\n',
    outputType: { base: 'string', nullable: false }
  });
  authoring.drop('construct', { id: 'fill' });
  authoring.configure('fill', { typeId: 'text-document', construction: { mode: 'content' } });
  authoring.configure('fill', { access: { grants: [{ roleId, level: 'write' }] } });
  authoring.connect('src', 'value', 'fmt', 'record');
  authoring.connect('fmt', 'value', 'fill', 'content');
  return authoring.definition();
}

const documentsOrgs = new Set(
  (await db.collection('plugin_installs').find({ pluginId: 'documents' }).toArray())
    .map(install => String(install.organizationId))
);

const activeDefs = await db.collection('process_definitions').find({
  ...(orgArgs.length ? { 'lineage.organizationId': { $in: orgArgs } } : {}),
  'states.main': 'ACTIVE'
}).toArray();

const orgIds = [...new Set(activeDefs.map(def => String(def.lineage?.organizationId || '')).filter(Boolean))]
  .filter(orgId => (orgArgs.length ? orgArgs.includes(orgId) : documentsOrgs.has(orgId)));

const minted = [];
const results = [];
for (const orgId of orgIds) {
  const existing = await db.collection('process_definitions').findOne({
    'lineage.organizationId': orgId,
    'identity.name': DEFINITION_NAME
  });
  if (existing) {
    results.push(`${orgId}: SKIPPED (${DEFINITION_NAME} already exists)`);
    continue;
  }

  const org = await db.collection('organizations').findOne({ _id: orgId });
  const assignments = Object.values(org?.data?.roleAssignments || {})
    .filter(assignment => Array.isArray(assignment.roleIds) && assignment.roleIds.length)
    .sort((a, b) => String(a.userId).localeCompare(String(b.userId)));
  const roles = org?.data?.roles || {};
  const assignment = assignments.find(entry => entry.roleIds.some(roleId => roles[roleId]?.agentChat))
    || assignments[0] || null;
  if (!assignment) {
    results.push(`${orgId}: SKIPPED (no member holds a role)`);
    continue;
  }
  const roleId = assignment.roleIds.find(id => roles[id]?.agentChat) || assignment.roleIds[0];

  if (dryRun) {
    results.push(`${orgId}: would seed ${DEFINITION_NAME} (role ${roleId}, user ${assignment.userId})`);
    continue;
  }

  const sessionId = randomBytes(24).toString('hex');
  await db.collection('sessions').insertOne({
    sessionId,
    userId: assignment.userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000)
  });
  minted.push(sessionId);
  try {
    const headers = { 'content-type': 'application/json', cookie: `sessionId=${sessionId}` };
    const draft = await fetch(`${APP}/api/process-definitions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: DEFINITION_NAME, data: templateFillData(orgId, roleId) })
    });
    if (!draft.ok) throw new Error(`draft ${draft.status}: ${(await draft.text()).slice(0, 300)}`);
    const created = await draft.json();

    const activate = await fetch(`${APP}/api/process-definitions/${created._id}/activate`, { method: 'POST', headers });
    if (!activate.ok) throw new Error(`activate ${activate.status}: ${(await activate.text()).slice(0, 300)}`);

    const execute = await fetch(`${APP}/api/process-definitions/active/actions/fill/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { name: INSTANCE_NAME } })
    });
    if (!execute.ok) throw new Error(`execute ${execute.status}: ${(await execute.text()).slice(0, 300)}`);

    results.push(`${orgId}: SEEDED ${DEFINITION_NAME} (definition ${created._id}, role ${roleId}, user ${assignment.userId}, instance ${INSTANCE_NAME})`);
  } catch (error) {
    results.push(`${orgId}: FAILED (${error.message})`);
  }
}

if (minted.length) {
  await db.collection('sessions').deleteMany({ sessionId: { $in: minted } });
}
console.log(results.join('\n') || 'No matching organizations found.');
process.exit(0);
