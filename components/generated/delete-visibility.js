import { hasPermissionGrant } from '#shared/access-control.js';
import { useInstancesStore } from '~/stores/instances';
import { useRegistryStore } from '~/stores/registry';

// Generated-surface delete visibility on the client state model: the
// feature gate comes from effective permissions over the type's feature
// key, and the delete capability from the registry view — a registry-known
// type is deletable through its generic instance service; a legacy type
// keeps its feature route only while that route stays mounted.
export function canDeleteGeneratedEntity({ authStore, domainUi, entity, typeId } = {}) {
  const instances = useInstancesStore();
  const registry = useRegistryStore();
  const typeKey = instances.canonicalTypeKey(typeId);
  const entityId = entity?._id || entity?.identity?.uid || '';
  return Boolean(
    entityId
    && typeSupportsClientDelete(typeKey, registry, instances)
    && hasPermissionGrant({
      permissions: authStore?.activePermissions,
      feature: featureKey(typeKey),
      action: 'delete',
      entity,
      typeId
    })
  );
}

export function featureKey(typeId = '') {
  const instances = useInstancesStore();
  const typeKey = instances.canonicalTypeKey(typeId);
  const route = instances.endpointsFor(typeKey).list();
  // Feature-routed types keep the route's collection feature; types on the
  // generic instance transport share the server's cts-types access feature
  // (the projected field policy binds every instance-served type to it).
  if (!route.startsWith('/api/instances/')) {
    const fromRoute = /^\/api\/([^/]+)/.exec(route)?.[1];
    if (fromRoute) return fromRoute.replace(/-/g, '_');
  }
  return 'cts-types';
}


function typeSupportsClientDelete(typeKey = '', registry = {}, instances = {}) {
  // Registry-known types are executable through the generic instance
  // service, whose capability contract allows delete.
  if (registry.typeRecord?.(typeKey)) return true;
  // Legacy types keep mounted feature routes; the endpoint resolver knows
  // which (framework + pack feature modules).
  return !String(instances.endpointsFor(typeKey).list()).startsWith('/api/instances/');
}
