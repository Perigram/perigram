import { normalizeScreenContract } from './screen-contract.js';
import {
  withCompiledLineage,
  buildActionGraphContext,
  featureFromTypeId,
  groupGrantsByFeature,
  typeIdFromFeature,
  typeIdFromProducerOutputs,
  aggregateScreenRequirement,
  dedupeRoleCreateActions,
  inferredScreenActions,
  inferredDetailScreenActions,
  childRegionsForParentDetail,
  contextualParentActions,
  entityLabelOf
} from './compiler-core.js';

export function compileScreens(processOrScreens = {}, domain = {}, compiledRoles = {}, lineageBindings = []) {
  const screens = processOrScreens.screens || processOrScreens;
  const inferredScreens = inferScreensFromRoleGrants({
    screens,
    roles: compiledRoles,
    domain,
    producerOutputs: processOrScreens.producerOutputs || {},
    actions: processOrScreens.actions || {},
    graph: processOrScreens.graph || {},
    lineageBindings
  });
  return Object.fromEntries(Object.entries({ ...screens, ...inferredScreens }).map(([id, screen]) => {
    const normalized = normalizeScreenContract(screen);
    const sources = normalized.sources.map(source => withCompiledLineage(source, normalized, lineageBindings));
    return [id, {
      id: normalized.id || id,
      label: normalized.label || normalized.id || id,
      labelKey: normalized.labelKey || null,
      kind: normalized.kind || 'route',
      template: normalized.template,
      route: normalized.route || '',
      sourceRoute: normalized.sourceRoute || normalized.route || '',
      placement: normalized.placement || 'hub',
      typeId: normalized.typeId || null,
      required: normalized.required || null,
      roleIds: normalized.roleIds || [],
      scope: normalized.scope || {},
      bindings: normalized.bindings || {},
      sources,
      regions: normalized.regions,
      actions: normalized.actions || []
    }];
  }));
}

export function inferScreensFromRoleGrants({ screens = {}, roles = {}, domain = {}, producerOutputs = {}, actions = {}, graph = {}, lineageBindings = [] } = {}) {
  const inferred = {};
  const graphContext = buildActionGraphContext({ actions, graph });
  // Authored stations are per-kind deltas: an authored typeList or
  // instanceDetail suppresses only the inferred station it equals in kind,
  // while any other authored template for the role + feature stands in for
  // both generated stations (a chrome screen replaces the feature's
  // generated surfaces as a whole).
  const existingKeys = new Set(Object.values(screens).flatMap(screen => {
    const roleIds = screen.roleIds?.length ? screen.roleIds : Object.keys(roles);
    const feature = screen.required?.feature || featureFromTypeId(domain, screen.typeId);
    const station = screen.typeId || feature;
    if (!station) return [];
    const isList = screen.template === 'typeList' || screen.kind === 'typeList';
    const isDetail = screen.template === 'instanceDetail' || screen.kind === 'instanceDetail';
    const kinds = isList ? ['list'] : isDetail ? ['detail'] : ['list', 'detail'];
    return roleIds.flatMap(roleId => kinds.map(kind => `${roleId}:${station}:${kind}`));
  }));

  for (const [roleId, role] of Object.entries(roles)) {
    const grantsByFeature = groupGrantsByFeature(role.grants || []);
    for (const [feature, grants] of grantsByFeature) {
      // Grants derived from actions and producer outputs carry the entity
      // type they were authored against — inference emits one screen per
      // such type, so org-authored types sharing one collection (feature)
      // each get their own surface instead of collapsing onto an arbitrary
      // pack sibling. Feature-only grants keep the legacy resolution.
      const authoredTypes = [...new Set(grants.map(grant => grant.typeId).filter(Boolean))];
      const resolvedTypes = authoredTypes.length
        ? authoredTypes
        : [typeIdFromFeature(domain, feature) || typeIdFromProducerOutputs(producerOutputs, domain, feature)].filter(Boolean);
      for (const typeId of resolvedTypes) {
      const listSuppressed = existingKeys.has(`${roleId}:${typeId}:list`) || existingKeys.has(`${roleId}:${feature}:list`);
      const detailSuppressed = existingKeys.has(`${roleId}:${typeId}:detail`) || existingKeys.has(`${roleId}:${feature}:detail`);
      if (listSuppressed && detailSuppressed) continue;
      const id = `auto_${roleId}_${typeId}`;
      const detailId = `${id}_detail`;
      const required = aggregateScreenRequirement(feature, grants);
      const roleActions = dedupeRoleCreateActions(role.actions || [], actions);
      const directActions = inferredScreenActions(roleActions, feature, typeId);
      const detailDirectActions = inferredDetailScreenActions(roleActions, feature, typeId);
      const childRegions = childRegionsForParentDetail({
        role: { ...role, actions: roleActions },
        parentTypeId: typeId,
        domain,
        actions,
        graphContext,
        lineageBindings
      });
      const contextualActions = contextualParentActions(roleActions, typeId, domain, actions, graphContext, mergedHierarchyBindings(lineageBindings, domain));
      if (!listSuppressed) inferred[id] = {
        id,
        label: entityLabelOf(domain, typeId) || typeId,
        kind: 'typeList',
        template: 'typeList',
        placement: 'hub',
        typeId,
        required,
        roleIds: [roleId],
        sources: [{
          id: typeId,
          typeId,
          mode: 'list',
          required
        }],
        // Class-level actions (create) attach to the list's main region —
        // the surface the generator renders buttons on; screen-level
        // actions alone were never drawn.
        regions: [{
          id: 'main',
          slot: 'main',
          sourceId: typeId,
          surface: 'table',
          actions: directActions
        }],
        actions: directActions
      };
      if (!detailSuppressed) inferred[detailId] = {
        id: detailId,
        label: entityLabelOf(domain, typeId) || typeId,
        kind: 'instanceDetail',
        template: 'instanceDetail',
        placement: 'detail',
        typeId,
        required,
        roleIds: [roleId],
        sources: [{
          id: typeId,
          typeId,
          mode: 'single',
          required,
          identifier: '$screen.scope.instanceId'
        }, ...childRegions.sources],
        regions: [{
          id: 'main',
          slot: 'main',
          sourceId: typeId,
          surface: 'detail',
          actions: [...new Set([...detailDirectActions, ...contextualActions])]
        }, ...childRegions.regions],
        actions: [...new Set([...detailDirectActions, ...contextualActions, ...childRegions.actionIds])]
      };
      existingKeys.add(`${roleId}:${typeId}:list`);
      existingKeys.add(`${roleId}:${typeId}:detail`);
      }
      existingKeys.add(`${roleId}:${feature}:list`);
      existingKeys.add(`${roleId}:${feature}:detail`);
    }
  }

  return inferred;
}

// Crystallization Phase 4 — inference owns default stations. Detector for
// authored screens that are projection-equal to the station
// `inferScreensFromRoleGrants` would emit for the same role + type: such
// screens only suppress an identical inference and are hand-maintained
// slop. Pure comparison: the inference runs with an empty authored set
// (no existingKeys suppression), both sides project through
// `normalizeScreenContract`, and equivalence covers exactly the fields
// inference sets — any authored customization (label, route, bindings,
// extra sources/regions) makes the screen NOT redundant.
