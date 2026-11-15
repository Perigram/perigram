import { generatedScreenRoute, normalizeScreenContract } from './screen-contract.js';
import { mergedHierarchyBindings, lineageRelationsForParent } from './hierarchy-utils.js';
import {
  buildActionGraphContext,
  effectiveActionParentTypeId,
  entityLabelOf,
  parentRelationForChild,
  replacePlaceholders,
  resolveEntityFeature
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


export function withCompiledLineage(source = {}, screen = {}, lineageBindings = []) {
  if (screen.template !== 'typeList' || source.mode !== 'list' || source.typeId !== screen.typeId) return source;
  return { ...source, lineageBindings: lineageBindings.map(binding => ({ ...binding })) };
}

export function projectScreenForInferenceEquivalence(screen = {}) {
  return {
    label: screen.label ?? null,
    kind: screen.kind ?? null,
    template: screen.template ?? null,
    placement: screen.placement ?? null,
    typeId: screen.typeId ?? null,
    required: screen.required ?? null,
    roleIds: [...(screen.roleIds || [])],
    sources: screen.sources || [],
    regions: screen.regions || [],
    actions: screen.actions || []
  };
}

// Canonical form for projection equivalence: null- and undefined-valued
// entries are absent. Inference's requirement aggregation spells "unset"
// grant conditions as undefined keys (`rule`, `scope`, `transitions`),
// while any JSON-persisted authored record drops them — null and absent
// are the same projection, and only non-null differences distinguish an
// override from inference slop.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(key => value[key] !== null && value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// Screen actions attach by the screen's entity type when the action knows
// one (org-type actions must not attach to a sibling type's screen through
// a shared feature); feature-only actions keep the feature match.
function actionTargetsScreenType(action = {}, typeId = '', feature = '') {
  return action.typeId ? action.typeId === typeId : action.feature === feature;
}

export function inferredScreenActions(roleActions = [], feature, typeId = '') {
  return roleActions
    .filter(action => actionTargetsScreenType(action, typeId, feature))
    .map(action => action.actionId);
}

export function inferredDetailScreenActions(roleActions = [], feature, typeId = '') {
  return roleActions
    .filter(action => actionTargetsScreenType(action, typeId, feature))
    .filter(action => (action.actionKind || 'createEntity') !== 'createEntity')
    .map(action => action.actionId);
}

// One create affordance per (type, mode, initial state): the first
// compiled create owns the surface's button; later same-shape constructs
// stay executable actions.
export function dedupeRoleCreateActions(roleActions = [], processActions = {}) {
  const seen = new Set();
  return roleActions.filter(roleAction => {
    const actionId = roleAction.actionId || roleAction.id;
    const action = processActions[actionId] || {};
    const kind = roleAction.actionKind || action.actionKind || 'createEntity';
    if (kind !== 'createEntity') return true;
    const key = `${action.typeId || roleAction.typeId || ''}:${action.construction?.mode || ''}:${action.state?.to || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function contextualParentActions(roleActions = [], parentTypeId = '', domain = {}, processActions = {}, graphContext = buildActionGraphContext({ actions: processActions }), lineageBindings = []) {
  return roleActions
    .filter((roleAction) => {
      const actionId = roleAction.actionId || roleAction.id;
      const processAction = processActions[actionId] || {};
      const parentIncoming = graphContext.parentIncomingByActionId.get(actionId);
      if (!isParentBoundCreateAction(roleAction, processAction, parentIncoming, lineageBindings)) return false;
      const actionParent = effectiveActionParentTypeId({ ...processAction, ...roleAction }, parentIncoming, lineageBindings);
      if (actionParent !== parentTypeId) return false;
      const childTypeId = roleAction.typeId || processAction.typeId || '';
      return !parentRelationForChild(childTypeId, parentTypeId, lineageBindings);
    })
    .map(action => action.actionId);
}

function isParentBoundCreateAction(roleAction = {}, processAction = {}, parentIncoming = null, lineageBindings = []) {
  const kind = roleAction.actionKind || processAction.actionKind || 'createEntity';
  const parentTypeId = effectiveActionParentTypeId({ ...processAction, ...roleAction }, parentIncoming, lineageBindings);
  return kind === 'createEntity' && Boolean(parentTypeId);
}

export function childRegionsForParentDetail({ role = {}, parentTypeId = '', domain = {}, actions = {}, graphContext = buildActionGraphContext({ actions }), lineageBindings = [] } = {}) {
  const sourcesByEntity = new Map();
  const regions = [];
  const actionIds = [];
  const grantsByFeature = groupGrantsByFeature(role.grants || []);
  // Presentation placement reads the merged hierarchy: compiled lineage
  // bindings first, declared containment (children edges) filling pairs
  // the graph never composed.
  const hierarchy = mergedHierarchyBindings(lineageBindings, domain);
  const childRelations = lineageRelationsForParent(parentTypeId, hierarchy) || [];

  for (const relation of childRelations) {
    if (!relation.childType || !relation.lineageKey) continue;
    const childFeature = featureFromTypeId(domain, relation.childType);
    if (!childFeature) continue;
    const childGrants = grantsByFeature.get(childFeature) || [];
    if (!childGrants.length) continue;
    ensureChildRegion({
      sourcesByEntity,
      regions,
      childTypeId: relation.childType,
      childFeature,
      childGrants,
      parentIdKey: relation.lineageKey
    });
  }

  // Declared 'many' relations compose as readable child collections: the
  // record page arranges them with the same weight-driven ladder as
  // containment children (SPEC §Generative UI), and the detail body's
  // chip row for the covered key hides (the composer's relationKey
  // channel). Single-target relations stay chip rows on the body.
  for (const relation of domain.relations || []) {
    if (relation.ownerType !== parentTypeId || relation.cardinality !== 'many') continue;
    if (!relation.key || !relation.targetType) continue;
    const targetFeature = featureFromTypeId(domain, relation.targetType);
    if (!targetFeature) continue;
    const targetGrants = grantsByFeature.get(targetFeature) || [];
    if (!targetGrants.length) continue;
    const sourceId = `${relation.targetType}_${relation.key}_related`;
    if (sourcesByEntity.has(sourceId)) continue;
    sourcesByEntity.set(sourceId, {
      id: sourceId,
      label: relation.targetType,
      typeId: relation.targetType,
      mode: 'list',
      required: aggregateScreenRequirement(targetFeature, targetGrants),
      relation: { sourceId: parentTypeId, key: relation.key }
    });
    regions.push({
      id: `${sourceId}_region`,
      slot: 'children',
      sourceId,
      surface: 'card',
      actions: []
    });
  }

  for (const action of role.actions || []) {
    const actionId = action.actionId || action.id;
    const processAction = actions[actionId] || {};
    const kind = action.actionKind || processAction.actionKind || 'createEntity';
    const actionParent = effectiveActionParentTypeId({ ...processAction, ...action }, graphContext.parentIncomingByActionId.get(actionId), lineageBindings);
    const childTypeId = action.typeId || processAction.typeId || '';
    if (!childTypeId) continue;
    // A root create whose construction prompts a lineage parent belongs to
    // that parent's child region: the declared children edge makes the
    // pair valid and the picker binds the created child under the opened
    // parent.
    const constructionParent = constructionLineageParentTypeId({ ...processAction, ...action }, parentTypeId);
    if (kind !== 'createEntity' || (actionParent !== parentTypeId && constructionParent !== parentTypeId)) continue;
    const parentRelation = parentRelationForChild(childTypeId, parentTypeId, hierarchy)
      || (constructionParent === parentTypeId
        ? declaredParentRelation(childTypeId, parentTypeId, domain)
        : null);
    if (!parentRelation) continue;
    const childFeature = featureFromTypeId(domain, childTypeId);
    if (!childFeature) continue;
    const childGrants = grantsByFeature.get(childFeature) || [];
    const region = ensureChildRegion({
      sourcesByEntity,
      regions,
      childTypeId,
      childFeature,
      childGrants,
      parentIdKey: parentRelation.lineageKey
    });
    if (actionId && !region.actions.includes(actionId)) region.actions.push(actionId);
    if (actionId) actionIds.push(actionId);
  }
  return {
    sources: [...sourcesByEntity.values()],
    regions,
    actionIds
  };
}

function ensureChildRegion({ sourcesByEntity, regions, childTypeId, childFeature, childGrants = [], parentIdKey } = {}) {
  const sourceId = `${childTypeId}_children`;
  if (!sourcesByEntity.has(sourceId)) {
    sourcesByEntity.set(sourceId, {
      id: sourceId,
      label: childTypeId,
      typeId: childTypeId,
      mode: 'list',
      required: aggregateScreenRequirement(childFeature, childGrants),
      filters: { [parentIdKey]: '$screen.scope.instanceId' }
    });
  }
  let region = regions.find(item => item.sourceId === sourceId);
  if (!region) {
    region = {
      id: `${sourceId}_region`,
      // Child collections nest under the detail surface's record page
      // (the ui-mapping composer's children slot), never beside it as
      // top-level regions.
      slot: 'children',
      sourceId,
      surface: 'card',
      actions: []
    };
    regions.push(region);
  }
  return region;
}

// The parent a root create's construction prompts: a lineage input whose
// declared entity type matches the region parent (the org children-edge
// picker). Only the construction contract is consulted — graph parents
// still come from compiled lineage bindings.
function constructionLineageParentTypeId(action = {}, parentTypeId = '') {
  if (!parentTypeId) return '';
  return (action.construction?.inputs || [])
    .filter(input => String(input.id || input.path || '').startsWith('lineage.'))
    .some(input => input.typeId === parentTypeId || input.type?.typeId === parentTypeId)
    ? parentTypeId
    : '';
}

function declaredParentRelation(childTypeId = '', parentTypeId = '', domain = {}) {
  const triple = (domain.containment || []).find(candidate => (
    candidate.childType === childTypeId && candidate.parentType === parentTypeId
  ));
  return triple ? { childType: childTypeId, parentType: parentTypeId, lineageKey: triple.lineageKey } : null;
}



export function groupGrantsByFeature(grants = []) {
  const map = new Map();
  for (const grant of grants) {
    if (!grant?.feature) continue;
    if (!map.has(grant.feature)) map.set(grant.feature, []);
    map.get(grant.feature).push(grant);
  }
  return map;
}

// Read-level requirements for inferred surfaces: lineage scope rides along
// (a read may be parent-scoped), but state-scoped grant windows — the status
// rules and transitions of state-changing actions — never do. A read list
// gated by a transition's target states hides every instance outside them
// (stateless instances, states the wiring no longer targets); those windows
// govern what a role may CHANGE. An authored status window on an authored
// screen keeps scoping its reads — only the implicit derivation dies here.
export function aggregateScreenRequirement(feature, grants = []) {
  if (grants.length === 1) {
    const grant = grants[0];
    return {
      feature,
      level: 'read',
      scope: grant.scope
    };
  }
  const scopes = grants.map(grant => grant.scope).filter(Boolean);
  return {
    feature,
    level: 'read',
    ...(scopes.length === 1 ? { scope: scopes[0] } : {})
  };
}

// Grant features resolve to a type by exact type identity only. The
// per-class collection names ('files', 'items', 'groups', 'processes')
// are shared by every type of that class by design: attributing a
// collection-level feature to whichever type composes first is mount
// order dependent, so a shared collection attributes a screen only when
// exactly one non-meta type stores in it — otherwise the grant carries
// no attributable entity and inference skips it.
export function typeIdFromFeature(domain = {}, feature) {
  const entities = (domain.entities || []).filter(entity => !entity.meta);
  const exact = entities.filter(entity => entity.type === feature || `${entity.type}s` === feature);
  if (exact.length === 1) return exact[0].type;
  if (exact.length > 1) return null;
  const sharers = entities.filter(entity => entity.collection === feature);
  return sharers.length === 1 ? sharers[0].type : null;
}

export function typeIdFromProducerOutputs(producerOutputs = {}, domain = {}, feature) {
  const typeId = Object.values(producerOutputs)
    .find(profile => resolveEntityFeature(domain, profile.typeId) === feature)
    ?.typeId || null;
  const definition = (domain.entities || []).find(entity => entity.type === typeId);
  return definition?.meta ? null : typeId;
}



export function featureFromTypeId(domain = {}, typeId) {
  if (!typeId) return null;
  return resolveEntityFeature(domain, typeId);
}

export function screenAppliesToRole(screen = {}, roleId) {
  return !screen.roleIds?.length || screen.roleIds.includes(roleId);
}

export function compileScreenForAssignment(screen = {}, assignment = {}, roleId = null) {
  const incomplete = [];
  const scoped = JSON.parse(JSON.stringify({
    id: screen.id,
    label: screen.label,
    labelKey: screen.labelKey,
    kind: screen.kind,
    template: screen.template,
    route: screen.route,
    sourceRoute: screen.sourceRoute || screen.route,
    placement: screen.placement,
    typeId: screen.typeId || null,
    required: screen.required,
    scope: { ...(screen.scope || {}), ...(screen.bindings || {}) },
    sources: screen.sources || [],
    regions: screen.regions || [],
    actions: screen.actions || [],
    sourceRoleIds: roleId ? [roleId] : []
  }));
  replacePlaceholders(scoped, assignment.bindings || {}, incomplete);
  const screenKey = scoped.screenKey || makeScreenKey(scoped);
  return {
    incomplete,
    screen: {
      ...scoped,
      screenKey,
      route: generatedScreenRoute(screenKey)
    }
  };
}

function makeScreenKey(screen = {}) {
  const scopeValues = Object.values(screen.scope || {}).filter(value => value !== undefined && value !== null && value !== '');
  return [screen.id, ...(scopeValues.length ? scopeValues : [screen.route])].filter(Boolean).map(String).join(':');
}

export function mergeCompiledScreen(screenMap, screen) {
  const mergeKey = screenMergeKey(screen);
  screen.screenKey = mergeKey;
  screen.route = generatedScreenRoute(mergeKey);
  const existing = screenMap.get(mergeKey);
  if (!existing) {
    screenMap.set(mergeKey, screen);
    return;
  }
  existing.required = mergeRequirements(existing.required, screen.required);
  existing.actions = [...new Set([...(existing.actions || []), ...(screen.actions || [])])];
  existing.sourceRoleIds = [...new Set([...(existing.sourceRoleIds || []), ...(screen.sourceRoleIds || [])])];
  existing.roleIds = [...new Set([...(existing.roleIds || []), ...(screen.roleIds || [])])];
  existing.sources = mergeScreenSources(existing.sources || [], screen.sources || []);
  existing.regions = mergeScreenRegions(existing.regions || [], screen.regions || []);
}

function screenMergeKey(screen = {}) {
  if (screen.template === 'home') return screen.screenKey || screen.id;
  const typeId = screen.typeId;
  if (!String(screen.id || '').startsWith('auto_') || !typeId) return screen.screenKey || screen.id;
  const suffix = screen.template === 'instanceDetail' ? '_detail' : '';
  const scopeValues = Object.values(screen.scope || {}).filter(value => value !== undefined && value !== null && value !== '');
  return [`auto_${typeId}${suffix}`, ...scopeValues].filter(Boolean).map(String).join(':');
}

function mergeScreenSources(existing = [], next = []) {
  const byKey = new Map(existing.map(source => [sourceMergeKey(source), { ...source }]));
  for (const source of next) {
    const key = sourceMergeKey(source);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...source });
      continue;
    }
    current.required = mergeRequirements(current.required, source.required);
    current.filters = { ...(current.filters || {}), ...(source.filters || {}) };
  }
  return [...byKey.values()];
}

function sourceMergeKey(source = {}) {
  return [
    source.typeId || source.typeId || source.id,
    source.mode || '',
    JSON.stringify(source.filters || {}),
    source.identifier || ''
  ].join(':');
}

function mergeScreenRegions(existing = [], next = []) {
  const byKey = new Map(existing.map(region => [regionMergeKey(region), { ...region, actions: [...(region.actions || [])] }]));
  for (const region of next) {
    const key = regionMergeKey(region);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...region, actions: [...(region.actions || [])] });
      continue;
    }
    current.actions = [...new Set([...(current.actions || []), ...(region.actions || [])])];
  }
  return [...byKey.values()];
}

function regionMergeKey(region = {}) {
  return [region.sourceId || region.id, region.slot || '', region.surface || ''].join(':');
}

function mergeRequirements(left = null, right = null) {
  if (!left) return right || null;
  if (!right) return left || null;
  if (left.feature !== right.feature) return left;
  const rules = [left.rule, right.rule].flatMap(flattenRequirementRules).filter(Boolean);
  const scopes = [left.scope, right.scope].filter(Boolean);
  const transitions = [left.transitions, right.transitions].flatMap(item => Array.isArray(item) ? item : [item]).filter(Boolean);
  return {
    feature: left.feature,
    level: 'read',
    ...(rules.length === 1 ? { rule: rules[0] } : {}),
    ...(rules.length > 1 ? { rule: { any: dedupeObjects(rules) } } : {}),
    ...(scopes.length === 1 ? { scope: scopes[0] } : {}),
    ...(transitions.length ? { transitions: dedupeObjects(transitions) } : {})
  };
}

function flattenRequirementRules(rule) {
  if (!rule) return [];
  if (Array.isArray(rule.any)) return rule.any.flatMap(flattenRequirementRules);
  return [rule];
}

function dedupeObjects(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function screenToNavigation(screen = {}) {
  return {
    id: screen.screenKey || screen.id,
    route: screen.route,
    requires: screen.required || null,
    screenId: screen.id,
    screenKey: screen.screenKey
  };
}

export function dedupeNavigation(items = []) {
  const byKey = new Map();
  for (const item of items) {
    if (!item?.route) continue;
    byKey.set(item.id || item.route, item);
  }
  return [...byKey.values()];
}

