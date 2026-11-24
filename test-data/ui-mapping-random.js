// Random world generator for the UI mapping showcase: a seeded PRNG builds
// an entire hydration — types (random classes, fields, bases, units, enum
// sizes, labels, identifier flags, control pins, states, payloads, preview
// modes), a random containment DAG plus random relation edges, random
// instances with conforming values, and a random compiled contract (home /
// typeList / instanceDetail screens with lineage- and relation-scoped
// regions and actions). Nothing here is hand-authored: the point is to
// hydrate the generation layer with structures nobody chose. Same seed,
// same world. The world is what the seed rolls: nothing overwrites a
// rolled type, edge, or count after the fact, and the only post-roll
// touches are validity floors (an identifier flag somewhere, a control
// pin somewhere, nullable marking on refs whose targets rolled empty).
// Bundle records derive their display policy exactly the way
// `compileClientBundle()` does (`renderPolicyFor` over the authored
// declaration).
import { renderPolicyFor, isRefDescriptor } from '#packages/cts';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADJECTIVES = ['amber', 'brisk', 'cobalt', 'dune', 'ember', 'flint', 'gale', 'harbor', 'ivory', 'juniper', 'kestrel', 'lumen', 'myriad', 'nomad', 'onyx', 'pyre', 'quartz', 'ridge', 'sable', 'tundra'];
const NOUNS = ['ledger', 'beacon', 'cargo', 'delta', 'forge', 'glyph', 'haven', 'index', 'junction', 'kernel', 'locus', 'mantle', 'nexus', 'orbit', 'parcel', 'quarry', 'relay', 'summit', 'trellis', 'vector'];
const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa'];
const UNITS = ['mm', 'm2', 'min', 'deg', 'percent', 'currency', 'count'];
const PREVIEWS = ['image', 'geometry', 'attachment'];
const MIMES = { image: 'image/png', geometry: 'application/x-geom', attachment: 'text/plain' };

function makeRandom(seed) {
  const next = mulberry32(seed);
  const rand = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = items => items[rand(0, items.length - 1)];
  const chance = probability => next() < probability;
  const word = () => `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
  const name = prefix => `${prefix}-${rand(100, 999)}`;
  return { next, rand, pick, chance, word, name };
}

function randomDescriptor(rnd, { allowStructural = true, allowRefTypes = null, allowGroupTypes = null, depth = 0 } = {}) {
  const label = rnd.chance(0.5) ? `${pick2(rnd)} ${pick2(rnd)}` : undefined;
  const descriptor = {};
  if (label) descriptor.label = label.charAt(0).toUpperCase() + label.slice(1);
  if (rnd.chance(0.2)) descriptor.nullable = true;
  const bases = ['string', 'number', 'boolean', 'instant', 'quantity', 'enum'];
  if (allowStructural && depth < 2) bases.push('record', 'list', 'map', 'map', 'variant', 'json', 'blob', 'ref');
  descriptor.base = rnd.pick(bases);
  switch (descriptor.base) {
    case 'string':
      if (rnd.chance(0.25)) descriptor.max = rnd.rand(300, 600);
      break;
    case 'quantity':
      descriptor.unit = rnd.pick(UNITS);
      if (rnd.chance(0.4)) {
        descriptor.min = 0;
        descriptor.max = rnd.pick([10, 100, 1000]);
      }
      break;
    case 'number':
      if (rnd.chance(0.4)) {
        descriptor.min = 0;
        descriptor.max = rnd.pick([10, 100, 1000]);
      }
      break;
    case 'enum':
      descriptor.values = Array.from({ length: rnd.rand(2, 12) }, (_, index) => `${pick2(rnd)}-${index + 1}`);
      break;
    case 'ref': {
      const groups = (allowRefTypes || []).filter(id => allowGroupTypes && allowGroupTypes.includes(id));
      descriptor.accepts = [groups.length && rnd.chance(0.4) ? rnd.pick(groups) : rnd.pick(allowRefTypes || ['thing'])];
      break;
    }
    case 'record':
      descriptor.fields = Object.fromEntries(Array.from({ length: rnd.rand(1, 4) }, () => [
        pick2(rnd),
        randomDescriptor(rnd, { allowStructural: depth < 1, allowRefTypes, allowGroupTypes, depth: depth + 1 })
      ]));
      break;
    case 'map': {
      descriptor.itemType = rnd.chance(0.6)
        ? { base: 'quantity', unit: rnd.chance(0.4) ? 'percent' : rnd.pick(UNITS) }
        : randomDescriptor(rnd, { allowStructural: false, allowRefTypes, depth: depth + 1 });
      break;
    }
    case 'list':
      descriptor.itemType = randomDescriptor(rnd, { allowStructural: false, allowRefTypes, depth: depth + 1 });
      break;
    case 'variant': {
      const tags = Array.from({ length: rnd.rand(2, 4) }, () => pick2(rnd));
      descriptor.tags = [...new Set(tags)];
      descriptor.payloads = Object.fromEntries(descriptor.tags.map(tag => [
        tag,
        randomDescriptor(rnd, { allowStructural: depth < 1, allowRefTypes, allowGroupTypes, depth: depth + 1 })
      ]));
      break;
    }
    default:
      break;
  }
  return descriptor;
}

function pick2(rnd) {
  return rnd.pick(GREEK) + rnd.pick(GREEK).slice(0, 2);
}

function randomValue(rnd, descriptor, refTargets) {
  if (descriptor.nullable && rnd.chance(0.15)) return null;
  switch (descriptor.base) {
    case 'string':
      return (descriptor.max || 0) >= 120
        ? `${rnd.word()} ${rnd.word()} — ${rnd.word()} ${rnd.word()}; ${rnd.word()} ${rnd.word()} against the ${rnd.word()} ${rnd.word()} with a longer prose body for the accordion panel.`
        : rnd.word();
    case 'number':
      return rnd.rand(1, 999);
    case 'boolean':
      return rnd.chance(0.5);
    case 'instant': {
      const day = String(rnd.rand(1, 28)).padStart(2, '0');
      const month = String(rnd.rand(1, 12)).padStart(2, '0');
      return `2026-${month}-${day}T${String(rnd.rand(0, 23)).padStart(2, '0')}:00:00.000Z`;
    }
    case 'quantity':
      // Percent quantities roll within their scale so meters and knobs
      // show meaningful distributions instead of clamped saturation.
      return descriptor.unit === 'percent'
        ? { value: rnd.rand(0, 99) + rnd.rand(0, 99) / 100, unit: descriptor.unit }
        : descriptor.unit === 'currency'
          ? { value: rnd.rand(0, 400000), unit: descriptor.unit }
          : { value: rnd.rand(0, 4000) + rnd.rand(0, 99) / 100, unit: descriptor.unit };
    case 'enum':
      return rnd.pick(descriptor.values);
    case 'ref': {
      const options = (refTargets[descriptor.accepts[0]] || []).filter(Boolean);
      if (!options.length) return null;
      if (descriptor.nullable && rnd.chance(0.4)) return null;
      return rnd.pick(options);
    }
    case 'record':
      return Object.fromEntries(Object.entries(descriptor.fields).map(([key, sub]) => [key, randomValue(rnd, sub, refTargets)]));
    case 'list':
      return Array.from({ length: rnd.rand(0, 9) }, () => randomValue(rnd, descriptor.itemType, refTargets));
    case 'map':
      return Object.fromEntries(Array.from({ length: rnd.rand(0, 5) }, () => [
        pick2(rnd), randomValue(rnd, descriptor.itemType, refTargets)
      ]));
    case 'variant': {
      const tag = rnd.pick(descriptor.tags);
      return { tag, value: randomValue(rnd, descriptor.payloads[tag], refTargets) };
    }
    case 'json':
      return { seed: pick2(rnd), entries: rnd.rand(0, 50) };
    case 'blob':
      return { fileId: `gridfs-${pick2(rnd)}-${rnd.rand(1, 999)}`, mime: rnd.pick(Object.values(MIMES)), size: rnd.rand(1, 9000) * 1000 };
    default:
      return null;
  }
}

export function generateUiMappingWorld(seed = 7) {
  const rnd = makeRandom(seed);
  const typeCount = rnd.rand(6, 11);
  const ids = Array.from({ length: typeCount }, (_, index) => `t${index + 1}_${pick2(rnd)}`);
  const kinds = [];
  kinds[0] = 'group';
  for (let index = 1; index < typeCount; index += 1) {
    kinds[index] = rnd.pick(['group', 'item', 'file', 'item', 'process', 'file']);
  }
  if (!kinds.includes('item')) kinds[typeCount - 1] = 'item';

  // Flat state vocabularies (SPEC §7): authored in the process, not the
  // type — the world keeps them beside the types and serves their display
  // policy through the contract.
  const stateVocabularies = {};
  const terminalStates = {};

  const groupTypeIds = ids.filter((_, index) => kinds[index] === 'group');
  const types = ids.map((id, index) => {
    const kind = kinds[index];
    const fieldCount = rnd.rand(0, 8);
    const fields = Object.fromEntries(Array.from({ length: fieldCount }, () => [
      pick2(rnd) + String(rnd.rand(1, 99)),
      randomDescriptor(rnd, { allowRefTypes: ids, allowGroupTypes: groupTypeIds })
    ]));
    if (kind === 'item' && !Object.values(fields).some(descriptor => descriptor.base === 'string')) {
      fields.serial = { base: 'string', label: 'Serial' };
    }
    const type = {
      id,
      class: kind,
      version: 1,
      name: rnd.word().replace(/^./, character => character.toUpperCase()),
      glyph: `pi pi-${rnd.pick(['circle', 'bolt', 'bookmark', 'box', 'tag', 'star', 'cog', 'send'])}`,
      fields,
      edges: {}
    };
    if (kind === 'file') {
      const preview = rnd.pick(PREVIEWS);
      type.payload = { mime: [MIMES[preview]], accept: [`.${preview}`], maxSize: rnd.rand(1, 20) * 1024 * 1024, preview };
    }
    if (kind === 'item' || kind === 'process') {
      const stateCount = rnd.rand(2, 5);
      const values = Array.from({ length: stateCount }, (_, stateIndex) => `${pick2(rnd)}-${stateIndex + 1}`);
      stateVocabularies[type.id] = values;
      terminalStates[type.id] = rnd.chance(0.5) ? [values[values.length - 1]] : [];
    }
    const stringField = Object.entries(fields).find(([, descriptor]) => descriptor.base === 'string');
    // The identifier flag (the record's name source) lands on a short
    // string when one exists; a pinned editor control on another short
    // string exercises the authored-control precedence path live.
    if (stringField && rnd.chance(0.8)) stringField[1].identifier = true;
    const shortString = Object.entries(fields)
      .find(([, descriptor]) => descriptor.base === 'string' && !(descriptor.multiline === true || (descriptor.max || 0) >= 120) && !descriptor.identifier);
    if (shortString && rnd.chance(0.3)) shortString[1].control = 'Textarea';
    return type;
  });
  // Guarantee at least one authored editor control per world: pin a
  // Textarea on the first short string, preferring non-identity fields.
  if (!types.some(type => Object.values(type.fields).some(field => field.control))) {
    const isShortString = descriptor => descriptor.base === 'string'
      && !(descriptor.multiline === true || (descriptor.max || 0) >= 120);
    const host = types.find(type => Object.entries(type.fields).some(([, descriptor]) => isShortString(descriptor) && !descriptor.identifier))
      || types.find(type => Object.values(type.fields).some(isShortString));
    const pinned = host && Object.entries(host.fields).find(([, descriptor]) => isShortString(descriptor)
      && (!descriptor.identifier || Object.values(host.fields).filter(d => isShortString(d)).length === 1));
    if (pinned) pinned[1].control = 'Textarea';
  }
  // Guarantee at least one identifier flag per world: flag the first
  // string field, adding a name field when the world rolled stringless.
  if (!types.some(type => Object.values(type.fields).some(field => field.identifier))) {
    const host = types.find(type => Object.values(type.fields).some(descriptor => descriptor.base === 'string'));
    if (host) {
      Object.values(host.fields).find(descriptor => descriptor.base === 'string').identifier = true;
    } else {
      types[0].fields.name = { base: 'string', label: 'Name', identifier: true };
    }
  }

  // Containment: children edges point forward only (acyclic), groups may
  // hold several child types, any class can be a leaf child.
  types.forEach((type, index) => {
    if (type.class !== 'group') return;
    const childCount = rnd.rand(1, 3);
    type.edges.children = {};
    for (let child = 0; child < childCount; child += 1) {
      const target = ids[rnd.rand(index + 1, typeCount - 1)];
      if (!target || Object.values(type.edges.children).some(edge => edge.types.includes(target))) continue;
      type.edges.children[`childrenOf${pick2(rnd)}`] = { types: [target], onRemove: rnd.pick(['restrict', 'cascade', 'detach']) };
    }
    if (!Object.keys(type.edges.children).length) {
      const target = ids[Math.min(index + 1, typeCount - 1)];
      type.edges.children.primary = { types: [target], onRemove: 'restrict' };
    }
  });

  // Relations: random pairs, any direction, single or array.
  types.forEach(type => {
    type.edges.relations = {};
  });
  const relationCount = rnd.rand(2, 7);
  for (let index = 0; index < relationCount; index += 1) {
    const source = rnd.pick(types);
    const target = rnd.pick(types);
    if (source.id === target.id && rnd.chance(0.7)) continue;
    const key = `linked${pick2(rnd)}`;
    if (source.edges.relations[key]) continue;
    source.edges.relations[key] = { types: [target.id], onRemove: 'detach', cardinality: rnd.chance(0.5) ? 'array' : 'single' };
  }

  // Instances: rolled counts — some types stay empty, some carry the
  // pagination crossing, values conform to descriptors, each instance
  // takes at most one random lineage parent.
  const instancesByType = {};
  types.forEach(type => {
    instancesByType[type.id] = Array.from({ length: rnd.rand(0, 12) }, (_, index) => ({ id: `${type.id}-i${index + 1}`, type: type.id }));
  });
  const refTargets = {};
  types.forEach(type => {
    refTargets[type.id] = instancesByType[type.id].map(instance => ({ type: type.id, id: instance.id }));
  });
  // A ref to a type with no instances must be nullable, or no conforming
  // value exists for it — at any descriptor depth.
  const markEmptyRefsNullable = descriptor => {
    if (!descriptor || typeof descriptor !== 'object') return;
    if (descriptor.base === 'ref' && !descriptor.nullable) {
      const hasTargets = descriptor.accepts.some(accepted => refTargets[accepted]?.length);
      if (!hasTargets) descriptor.nullable = true;
    }
    markEmptyRefsNullable(descriptor.itemType);
    Object.values(descriptor.fields || {}).forEach(markEmptyRefsNullable);
    Object.values(descriptor.payloads || {}).forEach(markEmptyRefsNullable);
  };
  types.forEach(type => {
    Object.values(type.fields).forEach(markEmptyRefsNullable);
  });
  types.forEach(type => {
    instancesByType[type.id].forEach(instance => {
      instance.typeVersion = 1;
      instance.fields = Object.fromEntries(Object.entries(type.fields)
        .filter(([, descriptor]) => !isRefDescriptor(descriptor))
        .map(([name, descriptor]) => [name, randomValue(rnd, descriptor, refTargets)]));
      instance.lineage = {};
      instance.relations = {
        ...Object.fromEntries(Object.entries(type.fields)
          .filter(([, descriptor]) => isRefDescriptor(descriptor))
          .map(([name, descriptor]) => [name, randomValue(rnd, descriptor, refTargets)])),
        ...Object.fromEntries(Object.entries(type.edges.relations).map(([key, edge]) => {
          const options = refTargets[edge.types[0]] || [];
          if (!options.length) return [key, edge.cardinality === 'single' ? null : []];
          if (edge.cardinality === 'single') return [key, rnd.chance(0.6) ? rnd.pick(options) : null];
          return [key, Array.from({ length: rnd.rand(0, 3) }, () => rnd.pick(options))];
        }))
      };
      instance.state = stateVocabularies[type.id] ? rnd.pick(stateVocabularies[type.id]) : null;
      instance.payload = type.payload
        ? { fileId: `gridfs-${instance.id}`, mime: type.payload.mime[0], size: rnd.rand(1, 8000) * 1000 }
        : null;
    });
  });
  // Lineage: each instance takes at most one random parent over the
  // children edges that name its type.
  types.forEach(type => {
    const parentEdges = [];
    types.forEach(other => {
      Object.entries(other.edges.children || {}).forEach(([key, edge]) => {
        if (edge.types.includes(type.id)) parentEdges.push({ key, parentId: other.id });
      });
    });
    instancesByType[type.id].forEach(instance => {
      if (parentEdges.length && rnd.chance(0.85)) {
        const parent = rnd.pick(parentEdges);
        const parentPool = instancesByType[parent.parentId];
        if (parentPool.length) {
          instance.lineage[parent.key] = { type: parent.parentId, id: rnd.pick(parentPool).id };
        }
      }
    });
  });

  const populated = types.filter(type => instancesByType[type.id].length);
  const detailTypes = populated.slice(0, 4);

  const actions = {};
  const addAction = (id, action) => {
    actions[id] = action;
  };
  populated.forEach(type => {
    const inputNames = Object.keys(type.fields).slice(0, 3);
    addAction(`a_create_${type.id}`, {
      id: `a_create_${type.id}`, label: `New ${type.name}`, actionKind: 'createInstance', typeId: type.id,
      trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
      construction: { mode: 'generic', inputs: inputNames }
    });
    const vocabulary = stateVocabularies[type.id];
    if (vocabulary) {
      // Transition labels derive from the target state's display (SPEC
      // §7: the resolver names a transition from its target value when
      // the action authors none) — the world authors none.
      addAction(`a_shift_${type.id}`, {
        id: `a_shift_${type.id}`, label: null, actionKind: 'updateInstance', typeId: type.id,
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
        state: { to: vocabulary[vocabulary.length - 1] }
      });
      if (vocabulary.length > 2) {
        addAction(`a_stage_${type.id}`, {
          id: `a_stage_${type.id}`, label: null, actionKind: 'updateInstance', typeId: type.id,
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
          state: { to: vocabulary[1] }
        });
      }
    }
    addAction(`a_delete_${type.id}`, {
      id: `a_delete_${type.id}`, label: `Delete ${type.name}`, actionKind: 'deleteInstance', typeId: type.id,
      trigger: { mode: 'manual' }, access: { level: 'admin', grants: [] }
    });
    addAction(`a_run_${type.id}`, {
      id: `a_run_${type.id}`, label: `Sync ${type.name}`, actionKind: 'runCommand', typeId: type.id,
      trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
    });
  });
  populated.forEach(type => {
    const relation = Object.entries(type.edges.relations)[0];
    if (relation) {
      const targetTypes = relation[1].types;
      const cardinality = relation[1].cardinality === 'single' ? 'one' : 'many';
      addAction(`a_link_${type.id}`, {
        id: `a_link_${type.id}`, label: 'Link', actionKind: 'link', typeId: type.id,
        relation: { key: relation[0], targetTypes, cardinality },
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
      });
      addAction(`a_unlink_${type.id}`, {
        id: `a_unlink_${type.id}`, label: 'Unlink', actionKind: 'unlink', typeId: type.id,
        relation: { key: relation[0], targetTypes, cardinality },
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
      });
    }
  });
  if (populated.length) {
    addAction('a_hidden_sweep', {
      id: 'a_hidden_sweep', label: 'Auto sweep', actionKind: 'updateInstance', typeId: populated[0].id,
      trigger: { mode: 'event' }, access: { level: 'write', grants: [] }
    });
  }

  const screens = {};
  screens.home_operator = {
    id: 'home_operator', screenKey: 'home_operator', label: `${rnd.word()} home`, kind: 'route', template: 'home',
    route: '/screens/home_operator', sourceRoute: '/screens/home_operator', placement: 'hub', typeId: null,
    required: null, roleIds: ['operator'], scope: {}, bindings: {},
    sources: [], regions: [], actions: []
  };
  populated.slice(0, rnd.rand(2, 4)).forEach((type, index) => {
    screens.home_operator.sources.push({ id: `s${index}`, typeId: type.id, mode: 'list', required: null });
    screens.home_operator.regions.push({ id: `r${index}`, slot: 'main', sourceId: `s${index}`, surface: 'list', actions: [] });
  });
  const listScreenTypes = populated.slice(0, 5);
  listScreenTypes.forEach(type => {
    const key = `list_${type.id}`;
    screens[key] = {
      id: key, screenKey: key, label: `${type.name}`, kind: 'typeList', template: 'typeList',
      route: `/screens/${key}`, sourceRoute: `/screens/${key}`, placement: 'hub', typeId: type.id,
      required: null, roleIds: ['operator'], scope: {}, bindings: {},
      sources: [{ id: 'main', typeId: type.id, mode: 'list', required: null }],
      regions: [{ id: 'main', slot: 'main', sourceId: 'main', surface: 'list', actions: [`a_create_${type.id}`, `a_run_${type.id}`, `a_link_${type.id}`].filter(id => actions[id]) }],
      actions: []
    };
  });
  detailTypes.forEach(type => {
    const key = `detail_${type.id}`;
    // Open the record whose child collections resolve the most instances
    // — the populated record, the one a person would open.
    const openableEdges = Object.entries(type.edges.children || {}).slice(0, 2);
    const childCount = inst => openableEdges.reduce((sum, [edgeKey, edge]) => sum
      + (instancesByType[edge.types[0]] || [])
        .filter(child => child.lineage[edgeKey]?.id === inst.id).length, 0);
    const instance = instancesByType[type.id].reduce((best, candidate) => (
      childCount(candidate) > childCount(best) ? candidate : best
    ), instancesByType[type.id][0]);
    const sources = [{ id: 'main', typeId: type.id, mode: 'single', required: null, identifier: '$screen.scope.instanceId' }];
    const detailActionPool = [`a_create_${type.id}`, `a_stage_${type.id}`, `a_shift_${type.id}`, `a_delete_${type.id}`, `a_run_${type.id}`, `a_link_${type.id}`, `a_unlink_${type.id}`]
      .filter(id => actions[id]);
    const detailActions = rnd.chance(0.5)
      ? detailActionPool
      : detailActionPool.slice(0, rnd.rand(1, 3));
    const regions = [{ id: 'main', slot: 'main', sourceId: 'main', surface: 'detail', actions: detailActions }];
    openableEdges.forEach(([edgeKey, edge], index) => {
      if (!instancesByType[edge.types[0]]?.length) return;
      sources.push({ id: `c${index}`, typeId: edge.types[0], mode: 'list', required: null, lineage: { sourceId: 'main', key: edgeKey } });
      regions.push({ id: `c${index}`, slot: 'children', sourceId: `c${index}`, surface: 'list', actions: [] });
    });
    const relation = Object.entries(type.edges.relations)[0];
    if (relation && instancesByType[relation[1].types[0]]?.length) {
      sources.push({ id: 'crel', typeId: relation[1].types[0], mode: 'list', required: null, relation: { sourceId: 'main', key: relation[0] } });
      regions.push({ id: 'crel', slot: 'children', sourceId: 'crel', surface: 'list', actions: [] });
    }
    screens[key] = {
      id: key, screenKey: key, label: `${type.name}`, kind: 'instanceDetail', template: 'instanceDetail',
      route: `/screens/${key}`, sourceRoute: `/screens/${key}`, placement: 'detail', typeId: type.id,
      required: null, roleIds: ['operator'], scope: { instanceId: instance.id }, bindings: {},
      sources, regions, actions: regions.flatMap(region => region.actions)
    };
  });
  // Data-state matrix: seeded assignments the showcase applies on demand
  // (?state=on) so loading skeletons, denied, and error states render
  // beside the naturally-ready world. One state per screen, distinct
  // screens, only sources that exist.
  const stateMatrix = {};
  const STATES = ['loading', 'denied', 'error'];
  const matrixScreens = Object.values(screens)
    .filter(screen => screen.template === 'typeList' && screen.sources.length)
    .slice(0, STATES.length);
  matrixScreens.forEach((screen, index) => {
    stateMatrix[screen.screenKey] = { [screen.sources[0].id]: STATES[index] };
  });

  const instances = {};
  types.forEach(type => {
    instances[type.id] = instancesByType[type.id];
  });

  // Derive the bundle display policy after every mutation has landed
  // (nullable marking touches descriptors late).
  const bundleTypes = types.map(type => {
    const policy = renderPolicyFor(type);
    return {
      ...type,
      name: policy.name,
      glyph: policy.glyph,
      identifier: policy.identifier,
      depiction: policy.depiction,
      sections: policy.sections,
      states: Object.fromEntries(Object.entries(type.states || {}).map(([axisName, axis]) => [
        axisName, { ...axis, render: policy.states[axisName] }
      ]))
    };
  });

  return {
    seed,
    bundle: { ok: true, errors: [], organizationId: `org-seed-${seed}`, types: bundleTypes },
    contract: {
      processId: `proc_seed_${seed}`,
      dataflowVersion: 4,
      roles: { operator: { id: 'operator', label: 'Operator', grants: [] } },
      screens,
      actions,
      navigation: [],
      // The compiled state display policy for the world's flat
      // vocabularies (severity derived per SPEC §7: terminal secondary,
      // others info).
      statePolicy: Object.fromEntries(Object.entries(stateVocabularies).map(([typeId, values]) => [
        typeId,
        Object.fromEntries(values.map(value => [value, {
          label: null,
          severity: null,
          icon: null,
          terminal: (terminalStates[typeId] || []).includes(value)
        }]))
      ])),
      // The authored machine edges over those vocabularies — a linear
      // chain in vocabulary order (the world authors its vocabularies as
      // ordered lanes), the board projection's legal-move contract.
      stateTransitions: Object.fromEntries(Object.entries(stateVocabularies).map(([typeId, values]) => [
        typeId,
        values.slice(0, -1).map((value, index) => ({
          from: value,
          to: values[index + 1],
          region: 'lifecycle',
          intent: null
        }))
      ]))
    },
    instances,
    sourceStatesMatrix: stateMatrix
  };
}

export const DEFAULT_RANDOM_SEED = 10;
