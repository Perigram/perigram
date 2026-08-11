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

export function planSheetDesignBackfill(designs = []) {
  const compositionCounts = new Map();
  const records = [];
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
    if (!invalidReason) compositionCounts.set(hash, (compositionCounts.get(hash) || 0) + 1);
    records.push({
      composition,
      compositionHash: hash,
      design,
      designId: stringId(design._id),
      sheetCount: quantity,
      invalidReason
    });
  }
  return records.map(record => ({
    ...record,
    duplicateComposition: !record.invalidReason && compositionCounts.get(record.compositionHash) > 1
  }));
}

async function planRunMigration(db, run, summary) {
  const runIds = [run._id, stringId(run._id)];
  const designs = await db.collection('sheet_designs').find({ 'lineage.runId': { $in: runIds } }).toArray();
  if (!designs.length) return null;
  const records = planSheetDesignBackfill(designs);
  const plan = { run, runIds, sheetDesignIds: [], records: [] };
  for (const record of records) {
    plan.sheetDesignIds.push(record.designId);
    const design = record.design;
    const nextData = {
      ...(design.data || {}),
      cassetteDesigns: record.composition,
      compositionHash: record.compositionHash,
      sheetCount: record.sheetCount
    };
    if (nextData.nestingParams && !nextData.solveParams) nextData.solveParams = nextData.nestingParams;
    delete nextData.nestingParams;
    const nextSummary = { ...(design.summary || {}), sheetCount: record.sheetCount };
    const allDesignIds = [design._id, record.designId];
    const existingSheets = await db.collection('sheets')
      .find({ 'lineage.sheetDesignId': { $in: allDesignIds } })
      .sort({ 'data.sheetIndex': 1, _id: 1 })
      .toArray();
    summary.designs += 1;
    if (record.duplicateComposition) summary.duplicateCompositions += 1;
    if (record.invalidReason) {
      summary.invalid.push({
        runId: stringId(run._id),
        sheetDesignId: record.designId,
        reason: record.invalidReason
      });
    } else if (existingSheets.length > record.sheetCount) {
      summary.invalid.push({
        runId: stringId(run._id),
        sheetDesignId: record.designId,
        compositionHash: record.compositionHash,
        reason: `Found ${existingSheets.length} physical sheets for expected multiplicity ${record.sheetCount}`
      });
    } else {
      summary.missingSheets += record.sheetCount - existingSheets.length;
    }
    plan.records.push({ ...record, nextData, nextSummary, existingSheets });
  }
  return plan;
}

async function prepareSheetTwins(db, plan) {
  for (const record of plan.records) {
    const currentRevisionId = record.nextData.revisions?.geometry?.currentId;
    for (let index = 0; index < record.existingSheets.length; index += 1) {
      const sheet = record.existingSheets[index];
      const set = {
        'lineage.sheetDesignId': record.design._id,
        'data.sheetIndex': index,
        'data.compositionHash': record.compositionHash
      };
      if (currentRevisionId) {
        set['provenance.parent'] = {
          source: {
            type: 'sheet_design',
            id: record.designId,
            revisionId: stringId(currentRevisionId)
          }
        };
      }
      const update = { $set: set };
      if (!currentRevisionId) update.$unset = { 'provenance.parent': '' };
      await db.collection('sheets').updateOne({ _id: sheet._id }, update);
    }
    await sheetsService.createFromSheetDesign({
      ...record.design,
      data: record.nextData,
      summary: record.nextSummary
    }, record.sheetCount, {
      organizationId: plan.run.lineage?.organizationId,
      userId: 'SYSTEM'
    });
  }
}

async function finalizeRun(db, plan) {
  for (const record of plan.records) {
    await db.collection('sheet_designs').updateOne(
      { _id: record.design._id },
      { $set: { data: record.nextData, summary: record.nextSummary } }
    );
  }
  const sheets = await db.collection('sheets')
    .find({ 'lineage.runId': { $in: plan.runIds } })
    .sort({ 'lineage.sheetDesignId': 1, 'data.sheetIndex': 1, _id: 1 })
    .toArray();
  await db.collection('nesting_runs').updateOne(
    { _id: plan.run._id },
    {
      $set: {
        'data.sheetDesignIds': plan.sheetDesignIds,
        'data.sheetIds': sheets.map(sheet => stringId(sheet._id))
      }
    }
  );
}

async function main() {
  const db = await connectDB();
  const summary = { runs: 0, designs: 0, duplicateCompositions: 0, missingSheets: 0, invalid: [] };
  const plans = [];
  for await (const run of db.collection('nesting_runs').find({})) {
    summary.runs += 1;
    const plan = await planRunMigration(db, run, summary);
    if (plan) plans.push(plan);
  }
  if (APPLY && !summary.invalid.length) {
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
