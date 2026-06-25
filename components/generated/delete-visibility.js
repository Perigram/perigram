import { hasPermissionGrant } from '#shared/access-control.js';
import { cncDomain } from '@cutkit/domain-cnc';

export function canDeleteGeneratedEntity({ authStore, domainUi, entity, entityType } = {}) {
  const normalizedType = uiEntityType(domainUi, entityType);
  const entityId = entity?._id || entity?.identity?.uid || '';
  return Boolean(
    entityId
    && domainUi?.endpointMap?.[normalizedType]
    && domainEntitySupportsDelete(entityType)
    && hasPermissionGrant({
      permissions: authStore?.activePermissions,
      feature: featureKey(domainUi, entityType),
      action: 'delete',
      entity,
      entityType
    })
  );
}

export function featureKey(domainUi, entityType = '') {
  const collection = domainEntityCollection(entityType)
    || domainEntityCollection(uiEntityType(domainUi, entityType))
    || `${entityType}s`;
  return collection.replace(/-/g, '_');
}

export function uiEntityType(domainUi, entityType = '') {
  if (domainUi?.endpointMap?.[entityType]) return entityType;
  const camel = String(entityType).replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return domainUi?.endpointMap?.[camel] ? camel : entityType;
}

function domainEntityCollection(entityType = '') {
  return domainEntity(entityType)?.collection || '';
}

function domainEntitySupportsDelete(entityType = '') {
  return domainEntity(entityType)?.operations?.delete === true;
}

function domainEntity(entityType = '') {
  const normalized = String(entityType);
  const snake = normalized.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const camel = normalized.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return (cncDomain.entities || []).find(item => (
    item.type === normalized
    || item.entityType === normalized
    || item.type === snake
    || item.entityType === snake
    || item.type === camel
    || item.entityType === camel
  ));
}
