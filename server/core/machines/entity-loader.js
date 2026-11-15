import { ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { createError } from 'h3';
import { CLASS_COLLECTIONS } from '#packages/cts';
import { normalizeTypeId } from '~/server/runtime/entities.js';
import { instanceStateView } from './status-projection.js';
import * as workflowOverridesService from '~/server/features/workflow-overrides/service.js';

export async function loadEntityForWorkflow(typeId, targetId, options = {}) {
  const { requireMachine = true, producerOutputId = null } = options;
  const normalizedTypeId = normalizeTypeId(typeId);

  const db = await connectDB();

  // CTS-native instances live in per-class collections resolved per call
  // (org-authored types never enter the static registry). Search them the
  // same way the instance boundary does; the status engine reads and writes
  // those documents through the §3 all-axis state map, never the legacy
  // status block.
  const found = await findInstanceDocument(db, targetId, normalizedTypeId);
  if (!found) {
    throw createError({
      statusCode: 404,
      message: `${normalizedTypeId} not found (ID: ${targetId})`
    });
  }

  const organizationId = found.doc.lineage?.organizationId || found.doc.origin?.organizationId || found.doc.organizationId;
  const machine = await workflowOverridesService.resolveActiveWorkflow({ typeId: normalizedTypeId, organizationId, producerOutputId });

  if (!machine && requireMachine) {
    throw createError({
      statusCode: 400,
      message: `No state machine defined for entity type: ${normalizedTypeId}`
    });
  }

  return {
    entity: instanceStateView(found.doc),
    machine,
    collection: found.collection,
    flexId: found.doc._id,
    instanceDoc: isFlatInstanceDoc(found.doc) ? found.doc : null
  };
}

// A §3 stored-shape instance: typed row + flat state, no legacy status
// block. Those documents write their state flat (SPEC §3/§7).
function isFlatInstanceDoc(doc = {}) {
  return Boolean(doc && doc.type && !doc.status && (doc.fields || typeof doc.state === 'string'));
}

async function findInstanceDocument(db, targetId, typeId) {
  const ids = [];
  try {
    ids.push(new ObjectId(String(targetId)));
  } catch {}
  if (!ids.length || String(ids[0]) !== String(targetId)) ids.push(String(targetId));
  for (const collection of Object.values(CLASS_COLLECTIONS)) {
    for (const id of ids) {
      const doc = await db.collection(collection).findOne({ _id: id, type: typeId });
      if (doc) return { doc, collection };
    }
  }
  return null;
}
