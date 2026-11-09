// One-shot repair: the facade nesting solve evaluates sheet stock from
// its items, so the installed service signature no longer prompts for a
// sheet count. Installs snapshot their declarations at install time;
// this strips the retired parameter from those snapshots. Re-activate the
// organization's process definitions afterwards to recompile their run
// actions.
//
//   node server/scripts/retire-nesting-sheet-count.js
//   node server/scripts/retire-nesting-sheet-count.js --org <id> --apply
import { connectDB } from '../db/mongo.js';

const APPLY = process.argv.includes('--apply');
const orgIndex = process.argv.findIndex(value => value === '--org' || value.startsWith('--org='));
const ORG = orgIndex < 0
  ? ''
  : (process.argv[orgIndex] === '--org' ? process.argv[orgIndex + 1] : process.argv[orgIndex].slice(6)) || '';

const db = await connectDB();
const installs = await db.collection('plugin_installs')
  .find({ pluginId: 'facade', ...(ORG ? { organizationId: ORG } : {}) })
  .toArray();

const strip = (service) => {
  if (service?.id !== 'nesting-solve') return service;
  const fields = { ...(service.signature?.input?.fields || {}) };
  if (!Object.hasOwn(fields, 'sheetCount')) return service;
  delete fields.sheetCount;
  return {
    ...service,
    signature: {
      ...service.signature,
      input: { ...service.signature.input, fields }
    }
  };
};

let patched = 0;
for (const install of installs) {
  const services = (install.services || []).map(strip);
  const declarations = {
    ...(install.declarations || {}),
    services: (install.declarations?.services || []).map(strip)
  };
  const changed = JSON.stringify(services) !== JSON.stringify(install.services)
    || JSON.stringify(declarations.services) !== JSON.stringify(install.declarations?.services);
  if (!changed) continue;
  if (APPLY) {
    await db.collection('plugin_installs').updateOne(
      { _id: install._id },
      { $set: { services, declarations } }
    );
  }
  patched += 1;
  console.log(`${APPLY ? '' : '[dry-run] '}${install.organizationId}: nesting-solve sheetCount ${APPLY ? 'retired' : 'would be retired'}`);
}

console.log(`${APPLY ? '' : '[dry-run] '}facade installs patched: ${patched}`);
process.exit(0);
