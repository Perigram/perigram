import crypto from 'node:crypto';
import { connectDB } from '../db/mongo.js';
import * as sheetsService from '../features/sheets/service.js';

const APPLY = process.argv.includes('--apply');

function stringId(value) {
  return value?.toString?.() || value || '';
}

export function canonicalComposition(items = []) {
  const counts = new Map();
  for (const item of items || []) {
    const id = stringId(item.cassetteDesignId || item.designId || item.id);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + Math.max(Number(item.count || item.quantity || 1), 0));
  }
  return [...counts.entries()]
    .map(([cassetteDesignId, count]) => ({ cassetteDesignId, count }))
    .filter(item => item.count > 0)
    .sort((left, right) => left.cassetteDesignId.localeCompare(right.cassetteDesignId));
}

export function compositionHash(composition = []) {
  const value = canonicalComposition(composition).map(item => [item.cassetteDesignId, item.count]);
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function compositionValidation(items = []) {
  if (!Array.isArray(items) || !items.length) return 'Cassette composition is empty';
  for (const item of items) {
    const id = stringId(item.cassetteDesignId || item.designId || item.id);
    const count = Number(item.count ?? item.quantity ?? 1);
    if (!id) return 'Cassette composition contains an item without a cassette design id';
    if (!Number.isInteger(count) || count < 1) return `Cassette design ${id} has invalid count ${item.count ?? item.quantity}`;
  }
  return '';
}

function stableDesignOrder(left = {}, right = {}) {
  const leftIndex = Number(left.data?.layoutIndex ?? left.data?.sheetIndex);
  const rightIndex = Number(right.data?.layoutIndex ?? right.data?.sheetIndex);
  if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex) && leftIndex !== rightIndex) return leftIndex - rightIndex;
  if (Number.isFinite(leftIndex) !== Number.isFinite(rightIndex)) return Number.isFinite(leftIndex) ? -1 : 1;
  const created = new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
  return created || stringId(left._id).localeCompare(stringId(right._id));
}

export function planSheetDesignCollapse(designs = []) {
  const groups = new Map();
  for (const design of [...designs].sort(stableDesignOrder)) {
    const sourceComposition = design.data?.cassetteDesigns || [];
    const composition = canonicalComposition(sourceComposition);
    const invalidComposition = compositionValidation(sourceComposition);
    const quantity = design.data?.compositionHash
      ? Number(design.data?.sheetCount || design.summary?.sheetCount || 0)
      : 1;
    const invalidQuantity = !Number.isInteger(quantity) || quantity < 1
      ? `Sheet design has invalid sheet count ${design.data?.sheetCount || design.summary?.sheetCount}`
      : '';
    const invalidReason = invalidComposition || invalidQuantity;
    const hash = invalidReason ? `invalid:${stringId(design._id)}` : compositionHash(composition);
    const existing = groups.get(hash);
    if (existing) {
      existing.sheetCount += quantity;
      existing.duplicateIds.push(stringId(design._id));
      existing.duplicateDbIds.push(design._id);
      existing.designs.push(design);
      continue;
    }
    groups.set(hash, {
      composition,
      compositionHash: hash,
      representative: design,
      representativeId: stringId(design._id),
      duplicateIds: [],
      duplicateDbIds: [],
      designs: [design],
      sheetCount: quantity,
      invalidReason
    });
  }
  return [...groups.values()];
}

async function planRunMigration(db, run, summary) {
  const runIds = [run._id, stringId(run._id)];
  const designs = await db.collection('sheet_designs').find({ 'lineage.runId': { $in: runIds } }).toArray();
  if (!designs.length) return null;
  const groups = planSheetDesignCollapse(designs);
  const plan = { run, runIds, representativeIds: [], groups: [] };
  for (const group of groups) {
    plan.representativeIds.push(group.representativeId);
    const representative = group.representative;
    const nextData = {
      ...(representative.data || {}),
      cassetteDesigns: group.composition,
      compositionHash: group.compositionHash,
      sheetCount: group.sheetCount
    };
    if (nextData.nestingParams && !nextData.solveParams) nextData.solveParams = nextData.nestingParams;
    delete nextData.nestingParams;
    const nextSummary = { ...(representative.summary || {}), sheetCount: group.sheetCount };
    const allDesignIds = [representative._id, group.representativeId, ...group.duplicateDbIds, ...group.duplicateIds];
    const existingSheets = await db.collection('sheets')
      .find({ 'lineage.sheetDesignId': { $in: allDesignIds } })
      .sort({ 'data.sheetIndex': 1, _id: 1 })
      .toArray();
    summary.groups += 1;
    summary.duplicates += group.duplicateIds.length;
    if (group.invalidReason) {
      summary.invalid.push({
        runId: stringId(run._id),
        sheetDesignId: group.representativeId,
        reason: group.invalidReason
      });
    } else if (existingSheets.length > group.sheetCount) {
      summary.invalid.push({
        runId: stringId(run._id),
        compositionHash: group.compositionHash,
        reason: `Found ${existingSheets.length} physical sheets for expected multiplicity ${group.sheetCount}`
      });
    } else {
      summary.missingSheets += group.sheetCount - existingSheets.length;
    }
    plan.groups.push({ ...group, nextData, nextSummary, existingSheets });
  }
  return plan;
}

async function prepareSheetTwins(db, plan) {
  for (const group of plan.groups) {
    const currentRevisionId = group.nextData.revisions?.geometry?.currentId;
    for (let index = 0; index < group.existingSheets.length; index += 1) {
      const sheet = group.existingSheets[index];
      const set = {
        'lineage.sheetDesignId': group.representative._id,
        'data.sheetIndex': index,
        'data.compositionHash': group.compositionHash
      };
      if (currentRevisionId) {
        set['provenance.parent'] = {
          source: {
            type: 'sheet_design',
            id: group.representativeId,
            revisionId: stringId(currentRevisionId)
          }
        };
      }
      const update = { $set: set };
      if (!currentRevisionId) update.$unset = { 'provenance.parent': '' };
      await db.collection('sheets').updateOne({ _id: sheet._id }, update);
    }
    await sheetsService.createFromSheetDesign({
      ...group.representative,
      data: group.nextData,
      summary: group.nextSummary
    }, group.sheetCount, {
      organizationId: plan.run.lineage?.organizationId,
      userId: 'SYSTEM'
    });
  }
}

async function finalizeRun(db, plan) {
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      for (const group of plan.groups) {
        await db.collection('sheet_designs').updateOne(
          { _id: group.representative._id },
          { $set: { data: group.nextData, summary: group.nextSummary } },
          { session }
        );
        if (!group.duplicateIds.length) continue;
        await db.collection('cassette_instances').updateMany(
          { 'lineage.sheetDesignId': { $in: [...group.duplicateDbIds, ...group.duplicateIds] } },
          { $set: { 'lineage.sheetDesignId': group.representative._id } },
          { session }
        );
        await db.collection('entity_revisions').deleteMany({
          'data.source.type': 'sheet_design',
          'data.source.id': { $in: group.duplicateIds }
        }, { session });
        await db.collection('sheet_designs').deleteMany(
          { _id: { $in: group.duplicateDbIds } },
          { session }
        );
      }

      const sheets = await db.collection('sheets')
        .find({ 'lineage.runId': { $in: plan.runIds } }, { session })
        .sort({ 'lineage.sheetDesignId': 1, 'data.sheetIndex': 1, _id: 1 })
        .toArray();
      await db.collection('nesting_runs').updateOne(
        { _id: plan.run._id },
        {
          $set: {
            'data.sheetDesignIds': plan.representativeIds,
            'data.sheetIds': sheets.map(sheet => stringId(sheet._id))
          }
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
}

async function assertTransactionSupport(db) {
  if (!db.client?.startSession) throw new Error('Apply mode requires MongoDB transaction support');
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection('nesting_runs').findOne({}, { session });
    });
  } finally {
    await session.endSession();
  }
}

async function main() {
  const db = await connectDB();
  const summary = { runs: 0, groups: 0, duplicates: 0, missingSheets: 0, invalid: [] };
  const plans = [];
  for await (const run of db.collection('nesting_runs').find({})) {
    summary.runs += 1;
    const plan = await planRunMigration(db, run, summary);
    if (plan) plans.push(plan);
  }
  if (APPLY && !summary.invalid.length) {
    await assertTransactionSupport(db);
    for (const plan of plans) await prepareSheetTwins(db, plan);
    for (const plan of plans) await finalizeRun(db, plan);
  }
  console.log(`${APPLY ? '[apply]' : '[dry-run]'} ${JSON.stringify(summary)}`);
  if (summary.invalid.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
