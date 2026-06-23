import { connectDB } from '../db/mongo.js';
import { compileProcessDefinition } from '../../packages/processes/src/index.js';
import { cncDomain, cncEntityConstruction } from '../../packages/domain-cnc/src/index.js';

function migrateProcessData(data = {}) {
  const normalized = normalizeProcessConstruction(data);
  if (!data.compiled) return data;
  return {
    ...normalized,
    compiled: compileProcessDefinition({
      ...normalized,
      compiled: null
    }, cncDomain)
  };
}

function normalizeProcessConstruction(data = {}) {
  const actions = Object.fromEntries(Object.entries(data.actions || {}).map(([id, action]) => {
    if ((action.actionKind || 'createEntity') !== 'createEntity') return [id, action];
    const contract = cncEntityConstruction[action.entityType] || null;
    if (!contract) return [id, action];
    const modes = Array.isArray(contract.modes) ? contract.modes : [];
    const requestedMode = action.construction?.mode || contract.defaultMode || 'genericCreate';
    const mode = modes.includes(requestedMode)
      ? requestedMode
      : (contract.defaultMode || modes[0] || 'genericCreate');
    const promptFields = (contract.inputs || []).filter(input => input.prompt || input.required);
    const existingFields = new Map((action.inputPolicy?.fields || []).map(field => [field.id || field.path, field]));
    return [id, {
      ...action,
      construction: {
        ...(action.construction || {}),
        mode,
        inputs: contract.inputs || []
      },
      inputPolicy: {
        ...(action.inputPolicy || {}),
        prompt: promptFields.length > 0,
        fields: promptFields.map(field => ({
          ...(existingFields.get(field.id || field.path) || {}),
          ...field,
          default: existingFields.get(field.id || field.path)?.default,
          valueRef: existingFields.get(field.id || field.path)?.valueRef
        }))
      }
    }];
  }));
  return { ...data, actions };
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({
    'data.compiled': { $exists: true, $ne: null },
    'data.actions': { $exists: true }
  });
  let scanned = 0;
  let updated = 0;

  for await (const process of cursor) {
    scanned++;
    const nextData = migrateProcessData(process.data || {});
    if (JSON.stringify(nextData) === JSON.stringify(process.data || {})) continue;
    await db.collection('process_definitions').updateOne(
      { _id: process._id },
      { $set: { data: nextData } }
    );
    updated++;
  }

  console.log(`Scanned ${scanned} process definitions; recompiled ${updated} process definitions.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
