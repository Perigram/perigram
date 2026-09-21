import { MongoClient } from 'mongodb';
import { cncCommands } from '../../packages/domain-cnc/src/commands.js';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cutkit_dev';
const apply = process.env.APPLY === '1';
const client = new MongoClient(uri);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value)
    .filter(key => value[key] !== undefined)
    .sort()
    .map(key => [key, canonicalize(value[key])]));
}

function inputsMatch(current, expected) {
  return JSON.stringify(canonicalize(current)) === JSON.stringify(canonicalize(expected));
}

function commandInputs(command = {}) {
  const abstractInputs = command.input?.abstractEntities || [];
  const acceptedTypes = new Set(abstractInputs.flatMap(input => input.accepts || []));
  return [
    ...abstractInputs.map(input => ({
      id: input.name || input.type || input.capability,
      label: input.label || input.name,
      typeId: input.type || '',
      capability: input.capability || '',
      accepts: input.accepts || [],
      required: Boolean(input.required),
      multiple: Boolean(input.multiple),
      abstract: true,
      prompt: false
    })),
    ...(command.input?.entities || [])
      .filter(input => !acceptedTypes.has(input.type))
      .map(input => ({
        id: input.name || input.type,
        label: input.label || input.name || input.type,
        typeId: input.type,
        kind: 'entity',
        required: Boolean(input.required),
        prompt: true,
        path: `entities.${input.name || input.type}`
      })),
    ...(command.input?.parameters || []).map(input => ({
      id: input.name,
      label: input.label || input.name,
      kind: input.type === 'object' ? 'json' : input.type || 'data',
      type: input.type || 'string',
      options: input.options || [],
      default: input.default ?? null,
      required: Boolean(input.required),
      prompt: input.display !== 'hidden',
      path: `parameters.${input.name}`,
      dataPath: `parameters.${input.name}`,
      typeId: input.typeId || '',
      editor: input.editor || '',
      templateFieldId: input.templateFieldId || ''
    }))
  ];
}

function migrateActions(actions = {}) {
  let changed = false;
  const inputs = commandInputs(cncCommands.generateAttachment);
  const next = Object.fromEntries(Object.entries(actions || {}).map(([id, action]) => {
    if (action?.actionKind !== 'runCommand' || action.commandId !== 'generateAttachment') return [id, action];
    if (inputsMatch(action.inputs || [], inputs)) return [id, action];
    changed = true;
    return [id, { ...action, inputs }];
  }));
  return { changed, value: next };
}

await client.connect();
try {
  const collection = client.db().collection('process_definitions');
  const cursor = collection.find({
    $or: [
      { 'data.actions': { $type: 'object' } },
      { 'data.compiled.actions': { $type: 'object' } }
    ]
  });
  let scanned = 0;
  let changed = 0;
  for await (const process of cursor) {
    scanned += 1;
    const canonical = migrateActions(process.data?.actions);
    const compiled = migrateActions(process.data?.compiled?.actions);
    if (!canonical.changed && !compiled.changed) continue;
    changed += 1;
    if (apply) {
      const set = {};
      if (canonical.changed) set['data.actions'] = canonical.value;
      if (compiled.changed) set['data.compiled.actions'] = compiled.value;
      await collection.updateOne({ _id: process._id }, { $set: set });
    }
  }
  console.log(JSON.stringify({ apply, scanned, changed }));
} finally {
  await client.close();
}
