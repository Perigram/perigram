import { createError } from 'h3';
import { createData, createIdentity, createStatus, createSpecs, inheritLineage } from '../../core/blocks/index.js';
import { getLineageFilter, hasLineagePermission } from '../../utils/permissions.js';
import { mapLineageQuery } from '../../utils/query.js';
import * as repository from './repository.js';
import { SheetInstance } from './model.js';

const toDTO = raw => raw ? new SheetInstance(raw).toJSON() : null;

export async function createFromDesign(design, data = {}, userId = 'SYSTEM') {
  const id = data.id || `sheet-instance-${design._id}-${data.sequence || 1}`;
  const existing = await repository.findById(id);
  if (existing) return toDTO(existing);
  const origin = createStatus('PLANNED', userId, { note: 'Planned sheet instance created from nesting output' });
  const lineage = inheritLineage(
    design,
    'sheetDesign',
    value => value,
    design.data?.revisions?.geometry?.currentId || null
  );
  const created = await repository.create({
    _id: id,
    identity: createIdentity(
      data.name || `${design.identity?.name || 'Sheet'} #${data.sequence || 1}`,
      id
    ),
    origin,
    status: origin,
    lineage,
    specs: createSpecs(design.specs || {}),
    data: createData({
      layoutHash: data.layoutHash || '',
      sequence: Number(data.sequence || 1),
      physicalSheetId: null
    })
  });
  return toDTO(created);
}

export async function getById(id, userId, userOrg, userRole, userPermissions = {}) {
  const entity = toDTO(await repository.findById(id));
  if (!entity) throw createError({ statusCode: 404, message: 'Sheet instance not found' });
  if (!hasLineagePermission(userPermissions, entity, 'sheet_instances', 'read')) throw createError({ statusCode: 403, message: 'Permission denied for sheet instances' });
  return entity;
}

export async function list(userId, userOrg, userRole, userPermissions = {}, filter = {}) {
  const raws = await repository.find(mapLineageQuery({ ...getLineageFilter(userPermissions), ...filter }));
  return raws.map(toDTO).filter(entity => hasLineagePermission(userPermissions, entity, 'sheet_instances', 'read'));
}

export async function bindPhysicalSheet(id, physicalSheetId) {
  return toDTO(await repository.updateById(id, { 'data.physicalSheetId': physicalSheetId }));
}
