import { mintId } from '~/utils/processDesignerIdentity.js';

export function useProcessDesignerScreens({
  draft,
  selectedScreenId,
  normalizeScreenContract,
  defaultTypeId,
  featureForTypeId
}) {
  // Crystallization Phase 4 — no screen is created from nothing. The only
  // creation verb duplicates an inferred station into an authored record:
  // fresh id and route, compile-only keys (labelKey, sourceRoute) and
  // compile-attached lineage bindings dropped, station kind preserved — so
  // the duplicate starts projection-equal to inference and validation
  // refuses it until the author actually deviates.
  function customize(station) {
    if (!station) return null;
    const id = mintId('screen');
    const record = withoutKeys(JSON.parse(JSON.stringify(station)), ['id', 'labelKey', 'route', 'sourceRoute']);
    record.sources = (record.sources || []).map(source => withoutKeys(source, ['lineageBindings']));
    draft.value ||= { data: {} };
    draft.value.data.screens ||= {};
    draft.value.data.screens[id] = { ...record, id, route: `/screens/${id}` };
    selectedScreenId.value = id;
    sync(draft.value.data.screens[id]);
    return draft.value.data.screens[id];
  }

  function removeSelected() {
    if (!selectedScreenId.value || !draft.value?.data?.screens) return false;
    delete draft.value.data.screens[selectedScreenId.value];
    selectedScreenId.value = Object.keys(draft.value.data.screens)[0] || null;
    return true;
  }

  function sync(screen) {
    if (!screen) return;
    screen.required ||= { feature: featureForTypeId(defaultTypeId()), level: 'read' };
    screen.roleIds ||= [];
    screen.bindings ||= {};
    screen.actions ||= [];
    if (['instanceDetail', 'formAction'].includes(screen.template) && screen.sources?.[0]) {
      screen.sources[0].mode = 'single';
      screen.sources[0].identifier ||= '$assignment.instanceId';
    }
    Object.assign(screen, normalizeScreenContract(screen), { kind: screen.kind || 'route' });
    const source = ensureSource(screen);
    const region = ensureRegion(screen);
    for (const item of screen.sources) item.required ||= { feature: featureForTypeId(item.typeId), level: screen.required.level || 'read' };
    for (const item of screen.regions) {
      if (!screen.sources.some(candidate => candidate.id === item.sourceId)) item.sourceId = source.id;
      item.actions ||= [];
    }
    return { source, region };
  }

  function ensureSource(screen) {
    screen.sources ||= [];
    if (!screen.sources.length) {
      const typeId = screen.typeId || defaultTypeId();
      const mode = screen.template === 'instanceDetail' || screen.template === 'formAction' ? 'single' : 'list';
      screen.sources.push(createSource(screen, typeId || 'source', typeId, mode));
    }
    return screen.sources[0];
  }

  function ensureRegion(screen) {
    const source = ensureSource(screen);
    screen.regions ||= [];
    if (!screen.regions.length) screen.regions.push(createRegion(screen, 'main', source.id));
    return screen.regions[0];
  }

  function addSource(screen) {
    if (!screen) return;
    screen.sources ||= [];
    const typeId = screen.typeId || defaultTypeId();
    const id = uniqueId('source', screen.sources);
    const mode = screen.template === 'instanceDetail' || screen.template === 'formAction' ? 'single' : 'list';
    const source = createSource(screen, id, typeId, mode);
    screen.sources.push(source);
    return source;
  }

  function removeSource(screen, index) {
    if (!screen?.sources || screen.sources.length <= 1) return false;
    const [removed] = screen.sources.splice(index, 1);
    for (const region of screen.regions || []) {
      if (region.sourceId === removed?.id) region.sourceId = screen.sources[0]?.id || '';
    }
    return true;
  }

  function renameSource(screen, source, id) {
    const previousId = source.id;
    source.id = id;
    for (const region of screen.regions || []) {
      if (region.sourceId === previousId) region.sourceId = id;
    }
  }

  function setSourceTypeId(screen, source, typeId) {
    source.typeId = typeId;
    source.required = { ...(source.required || {}), feature: featureForTypeId(typeId) };
    sync(screen);
  }

  function setSourceMode(screen, source, mode) {
    source.mode = mode;
    if (mode === 'single') source.identifier ||= '$assignment.instanceId';
    sync(screen);
  }

  function addRegion(screen) {
    if (!screen) return;
    const source = ensureSource(screen);
    screen.regions ||= [];
    const region = createRegion(screen, uniqueId('region', screen.regions), source.id);
    screen.regions.push(region);
    return region;
  }

  function removeRegion(screen, index) {
    if (!screen?.regions || screen.regions.length <= 1) return false;
    screen.regions.splice(index, 1);
    return true;
  }

  function addLineageBinding(source) {
    source.lineageBindings ||= [];
    const binding = {
      childTypeId: source.typeId || '',
      parentTypeId: '',
      lineageKey: '',
      sourceNode: '',
      sourceSocket: '',
      consumingNode: '',
      consumingSocket: ''
    };
    source.lineageBindings.push(binding);
    return binding;
  }

  function removeLineageBinding(source, index) {
    source.lineageBindings?.splice(index, 1);
  }

  function scalarRows(values = {}) {
    return Object.entries(values).map(([key, value]) => ({ key, value, type: scalarType(value) }));
  }

  function addScalar(values, prefix = 'key', value = 'value') {
    const key = uniqueMapKey(prefix, values);
    values[key] = value;
    return key;
  }

  function renameScalar(values, key, nextKey) {
    const normalized = String(nextKey || '').trim();
    if (!normalized || (normalized !== key && Object.hasOwn(values, normalized))) return false;
    const value = values[key];
    delete values[key];
    values[normalized] = value;
    return true;
  }

  function setScalarType(values, key, type) {
    values[key] = type === 'number' ? 0 : type === 'boolean' ? false : type === 'assignment' ? '$assignment.value' : 'value';
  }

  function removeScalar(values, key) {
    delete values[key];
  }

  return {
    addLineageBinding,
    addRegion,
    addScalar,
    addSource,
    customize,
    ensureRegion,
    ensureSource,
    removeLineageBinding,
    removeRegion,
    removeScalar,
    removeSelected,
    removeSource,
    renameScalar,
    renameSource,
    scalarRows,
    setScalarType,
    setSourceTypeId,
    setSourceMode,
    sync
  };
}

export function withoutKeys(record = {}, keys = []) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

function createSource(screen, id, typeId, mode) {
  return {
    id,
    label: '',
    typeId,
    mode,
    required: { feature: screen.required?.feature || '', level: screen.required?.level || 'read' },
    identifier: mode === 'single' ? '$assignment.instanceId' : null,
    filters: {},
    lineageBindings: []
  };
}

function createRegion(screen, id, sourceId) {
  return {
    id,
    label: '',
    slot: screen.template === 'workspaceLanes' ? (id === 'main' ? 'center' : 'right') : 'main',
    sourceId,
    surface: screen.template === 'instanceDetail' ? 'detail' : 'card',
    actions: []
  };
}

function uniqueId(prefix, records) {
  const ids = new Set(records.map(record => record.id));
  let index = records.length + 1;
  while (ids.has(`${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
}

function uniqueMapKey(prefix, values) {
  let key = prefix;
  let index = 2;
  while (Object.hasOwn(values, key)) key = `${prefix}_${index++}`;
  return key;
}

function scalarType(value) {
  if (typeof value === 'string' && value.startsWith('$assignment.')) return 'assignment';
  return typeof value === 'number' || typeof value === 'boolean' ? typeof value : 'string';
}
