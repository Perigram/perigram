import * as repository from './repository.js';
import * as nestingRunsRepository from '../nesting-runs/repository.js';
import { createError } from 'h3';
import {
  createStatus,
  inheritLineage,
  createData,
  createAttachment
} from '../../core/blocks/index.js';
import { statusService } from '../../core/machines/service.js';
import { mapLineageQuery } from '../../utils/query.js';
import { ObjectId } from 'mongodb';
import { SheetDesign } from './model.js';

/**
 * Sheet Designs Service - v24 Standardized
 */


function toDTO(design) {
  if (!design) return null;
  return new SheetDesign(design).toJSON();
}

export async function createFromRun(run, data, userId) {
  // 1. Lineage Inheritance
  const lineage = inheritLineage(run, 'run');
  const uid = `sheet-design-${new ObjectId().toString().slice(-8)}`;

  const origin = createStatus('READY', userId || 'SYSTEM', { note: 'Sheet design generated from nesting run' });

  const designData = {
    identity: {
      uid,
      name: data.name || `Sheet Design for Run ${run._id}`,
      slug: uid,
      serial: data.serial || uid.toUpperCase()
    },
    origin,
    status: origin,
    lineage,
    specs: data.specs || {},
    data: createData({
      geometry: {
        data: data.geometryData || null
      },
      attachments: {
        svg: data.svgId ? createAttachment('SVG', data.svgId, 'Design SVG') : null,
        dxf: data.dxfId ? createAttachment('DXF', data.dxfId, 'Design DXF') : null
      },
      specs: data.specs || {}
    })
  };

  const created = await repository.create(designData);
  return toDTO(created);
}

export async function getById(id) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Sheet design not found' });
  return toDTO(raw);
}

export async function list(filter = {}) {
  const finalFilter = mapLineageQuery(filter);
  const designs = await repository.find(finalFilter);
  return designs.map(toDTO);
}

export async function updateStatus(id, newState, userId, userRole, metadata = {}) {
  return await statusService.transition('sheet_design', id, newState, userId, userRole, metadata);
}
