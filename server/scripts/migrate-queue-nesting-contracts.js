import { connectDB } from '../db/mongo.js';
import { SYSTEM_DEFAULT_MACHINE_ID } from '../features/machines/service.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';
import { getPrimaryState } from '../../packages/core/src/index.js';

const APPLY = process.argv.includes('--apply');

function stringId(value) {
  return value?.toString?.() || value || '';
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function canonicalQueueItem(item = {}, designId) {
  const parameters = { ...(item.parameters || item.dimensions || {}) };
  return {
    type: item.type === 'PARAMETRIC' || Object.prototype.hasOwnProperty.call(parameters, 'T') ? 'PARAMETRIC' : 'STATIC',
    entityType: 'cassette_design',
    id: stringId(designId),
    quantity: Number(item.quantity ?? item.count ?? 1),
    parameters
  };
}

export async function migrateLegacyQueue(queue = {}, { defaultMachineId = SYSTEM_DEFAULT_MACHINE_ID, resolveDesignId } = {}) {
  const data = queue.data || {};
  const legacy = data.nestingParams || {};
  const current = data.nestingSettings || {};
  const items = data.job?.items || [];
  const migratedItems = [];
  const unresolved = [];
  for (const item of items) {
    const sourceId = item.id || item.cassetteDesignId || item.designId || item.cassetteTemplateId;
    const quantity = Number(item.quantity ?? item.count ?? 1);
    const designId = await resolveDesignId?.(sourceId, item.parameters || item.dimensions || {});
    if (!designId) {
      unresolved.push(stringId(sourceId));
      continue;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      unresolved.push(`${stringId(sourceId)} (invalid quantity ${item.quantity ?? item.count})`);
      continue;
    }
    migratedItems.push(canonicalQueueItem(item, designId));
  }
  if (unresolved.length) return { changed: false, queue, unresolved };

  const inventoryItems = current.inventoryItems || legacy.inventoryItems || [];
  const materialMode = current.materialMode || legacy.materialMode || (inventoryItems.length ? 'WAREHOUSE' : 'VIRTUAL');
  const nestingSettings = {
    materialMode: materialMode === 'WAREHOUSE' ? 'WAREHOUSE' : 'VIRTUAL',
    machineId: stringId(current.machineId || legacy.machineId || defaultMachineId),
    virtualWidth: positive(current.virtualWidth || legacy.virtualWidth || legacy.width) || 3000,
    virtualLength: positive(current.virtualLength || legacy.virtualLength || legacy.height) || 1500,
    virtualThickness: positive(current.virtualThickness || legacy.virtualThickness || legacy.thickness),
    warehouseId: stringId(current.warehouseId || legacy.warehouseId) || null,
    inventoryItems: [...new Set(inventoryItems.map(stringId).filter(Boolean))],
    toolProfileId: stringId(current.toolProfileId || legacy.toolProfileId || legacy.toolId) || null,
    requestedArtifacts: [...new Set((current.requestedArtifacts || legacy.requestedArtifacts || []).map(stringId).filter(Boolean))]
  };
  const nextData = {
    ...data,
    job: { ...(data.job || {}), items: migratedItems },
    nestingSettings
  };
  delete nextData.nestingParams;
  return {
    changed: JSON.stringify(nextData) !== JSON.stringify(data),
    queue: { ...queue, data: nextData },
    unresolved: []
  };
}

export function migrateLegacyCassetteInstanceStatus(instance = {}, { legacyStates = [], initialState = '' } = {}) {
  const current = getPrimaryState(instance.status);
  if (!legacyStates.includes(current) || !initialState) return { changed: false, instance };
  const status = {
    ...(instance.status || {}),
    state: {
      schemaVersion: 2,
      primary: initialState,
      active: { main: initialState },
      regions: { main: { state: initialState, path: [initialState] } }
    },
    userId: 'SYSTEM',
    timestamp: new Date(),
    metadata: { ...(instance.status?.metadata || {}), migration: 'queue-nesting-contracts' }
  };
  return { changed: true, instance: { ...instance, status, ...(instance.origin ? {} : { origin: status }) } };
}

function parameterSignature(parameters = {}) {
  return JSON.stringify(Object.entries(parameters || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right)));
}

async function buildDesignResolver(db) {
  const designs = await db.collection('cassette_designs').find({}).toArray();
  const direct = new Map(designs.map(design => [stringId(design._id), stringId(design._id)]));
  const byTemplateAndParameters = new Map();
  for (const design of designs) {
    const templateId = stringId(design.lineage?.templateId || design.provenance?.derivedFrom?.source?.id);
    if (!templateId) continue;
    const id = stringId(design._id);
    byTemplateAndParameters.set(`${templateId}:${parameterSignature(design.data?.parameters || {})}`, id);
  }
  return async (sourceId, parameters = {}) => {
    const id = stringId(sourceId);
    return direct.get(id)
      || byTemplateAndParameters.get(`${id}:${parameterSignature(parameters)}`)
      || null;
  };
}

async function main() {
  const db = await connectDB();
  const resolveDesignId = await buildDesignResolver(db);
  const summary = {
    queues: { scanned: 0, changed: 0, unresolved: [] },
    cassetteInstances: { scanned: 0, changed: 0 }
  };
  const queueUpdates = [];
  for await (const queue of db.collection('queues').find({})) {
    summary.queues.scanned += 1;
    const result = await migrateLegacyQueue(queue, { resolveDesignId });
    if (result.unresolved.length) {
      summary.queues.unresolved.push({ queueId: stringId(queue._id), sourceIds: result.unresolved });
      continue;
    }
    if (!result.changed) continue;
    summary.queues.changed += 1;
    queueUpdates.push({ current: queue, next: result.queue });
  }

  const cassetteWorkflow = cncDomain.workflows?.cassette_instance;
  const regionId = cassetteWorkflow?.primaryRegion || 'main';
  const initialState = cassetteWorkflow?.regions?.[regionId]?.initial || '';
  const instanceUpdates = [];
  for await (const instance of db.collection('cassette_instances').find({})) {
    summary.cassetteInstances.scanned += 1;
    const result = migrateLegacyCassetteInstanceStatus(instance, { legacyStates: ['NESTED'], initialState });
    if (!result.changed) continue;
    summary.cassetteInstances.changed += 1;
    instanceUpdates.push({ current: instance, next: result.instance });
  }
  if (APPLY && !summary.queues.unresolved.length) {
    for (const update of queueUpdates) {
      await db.collection('queues').replaceOne({ _id: update.current._id }, update.next);
    }
    for (const update of instanceUpdates) {
      await db.collection('cassette_instances').replaceOne({ _id: update.current._id }, update.next);
    }
  }
  console.log(`${APPLY ? '[apply]' : '[dry-run]'} ${JSON.stringify(summary)}`);
  if (summary.queues.unresolved.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
