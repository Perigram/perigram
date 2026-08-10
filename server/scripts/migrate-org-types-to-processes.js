import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { createProcessFromTemplate } from '../features/process-definitions/process-templates.js';
import { compileProcessDefinition } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';
import { createStatusState } from '../../packages/core/src/index.js';

function legacyTypeToTemplateId(type = '') {
  const key = String(type || '').toLowerCase();
  if (key === 'manufacturer') return 'manufacturer';
  if (key === 'customer') return 'customer';
  if (key === 'serviceprovider' || key === 'service-provider') return 'serviceProvider';
  return 'contractor';
}

function statusBlock(primary, userId = 'SYSTEM', note = '') {
  return {
    state: createStatusState(primary),
    userId,
    timestamp: new Date(),
    metadata: note ? { note } : {},
    eventId: null,
    lifecycle: { actors: [], attachments: {}, data: {} }
  };
}

async function main() {
  const db = await connectDB();
  const organizations = await db.collection('organizations').find({}).toArray();
  let created = 0;
  let skipped = 0;

  for (const organization of organizations) {
    if (organization.data?.activeProcessDefinitionId) {
      skipped++;
      continue;
    }

    const owner = await db.collection('users').findOne({
      'data.memberships.organizationId': organization._id
    });
    const userId = owner?._id?.toString() || 'SYSTEM';
    const templateId = legacyTypeToTemplateId(organization.data?.type || 'Contractor');
    const process = createProcessFromTemplate({
      templateId,
      organizationId: organization._id,
      userId
    });
    process.data.compiled = compileProcessDefinition(process.data, cncDomain);
    const doc = {
      _id: new ObjectId(),
      ...process,
      origin: statusBlock('ACTIVE', userId, 'Created by org-type process migration'),
      status: statusBlock('ACTIVE', userId, 'Activated by org-type process migration'),
      attachments: {},
      summary: {}
    };

    await db.collection('process_definitions').insertOne(doc);
    await db.collection('organizations').updateOne(
      { _id: organization._id },
      { $set: { 'data.activeProcessDefinitionId': doc._id } }
    );
    created++;
  }

  console.log(`Created ${created} process definitions; skipped ${skipped} organizations with active processes.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
