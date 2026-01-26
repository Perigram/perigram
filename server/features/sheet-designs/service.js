import * as repository from './repository.js';
import * as nestingRunsRepository from '../nesting-runs/repository.js';
import { createError } from 'h3';
import { createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Sheet Designs Service - v24 Standardized
 */

export async function createFromRun(run, data, userId) {
  // 1. Lineage Inheritance
  const lineage = inheritLineage(run, 'run');

  const origin = createStatus('READY', userId || 'SYSTEM', { note: 'Sheet design generated from nesting run' });

  const designData = {
    origin,
    status: origin,
    lineage,
    geometry: {
      svgId: data.svgId ? new ObjectId(data.svgId) : null,
      dxfId: data.dxfId ? new ObjectId(data.dxfId) : null,
      data: data.geometryData || null
    },
    specs: data.specs || {}
  };

  return await repository.create(designData);
}

export async function getById(id) {
  if (!ObjectId.isValid(id)) throw createError({ statusCode: 400, message: 'Invalid ID' });
  const design = await repository.findById(id);
  if (!design) throw createError({ statusCode: 404, message: 'Sheet design not found' });
  return design;
}

export async function list(filter = {}) {
  const finalFilter = mapLineageQuery(filter);
  return await repository.find(finalFilter);
}

export async function updateStatus(id, newState, userId, userRole, metadata = {}) {
  return await statusService.transition('sheet_design', id, newState, userId, userRole, metadata);
}