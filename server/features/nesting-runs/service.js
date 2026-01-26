import * as repository from './repository.js';
import { createError } from 'h3';
import { createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Nesting Runs Service - v24 Standardized
 */

export async function createFromQueue(queue, results, userId) {
  // 1. Lineage Inheritance
  const lineage = inheritLineage(queue, 'queue');

  const origin = createStatus('PROPOSED', userId || 'SYSTEM', { note: 'Nesting calculation completed' });

  const runData = {
    origin,
    status: origin,
    lineage,
    results: {
      efficiency: results.efficiency || 0,
      sheetCount: results.sheetCount || 0,
      remnantArea: results.remnantArea || 0
    },
    layoutData: results.layoutData || {},
    artifactIds: []
  };

  return await repository.create(runData);
}

export async function getById(id) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  return run;
}

export async function updateStatus(id, newState, userId, userRole, metadata = {}) {
  return await statusService.transition('nesting_run', id, newState, userId, userRole, metadata);
}

export async function list(filter = {}) {
  const finalFilter = mapLineageQuery(filter);
  
  return await repository.find(finalFilter);
}
