export function useProcessDesignerScreens({
  draft,
  selectedScreenId,
  createScreen,
  normalizeScreenContract,
  defaultEntityType,
  featureForEntityType
}) {
  function add() {
    const id = `screen_${Date.now()}`;
    draft.value ||= { data: {} };
    draft.value.data.screens ||= {};
    draft.value.data.screens[id] = createScreen(id);
    selectedScreenId.value = id;
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
    screen.required ||= { feature: featureForEntityType(defaultEntityType()), level: 'read' };
    screen.roleIds ||= [];
    screen.bindings ||= {};
    screen.actions ||= [];
    if (['entityDetail', 'formAction'].includes(screen.template) && screen.sources?.[0]) {
      screen.sources[0].mode = 'single';
      screen.sources[0].identifier ||= '$assignment.entityId';
    }
    Object.assign(screen, normalizeScreenContract(screen), { kind: 'route' });
    const source = ensureSource(screen);
    const region = ensureRegion(screen);
    for (const item of screen.sources) item.required ||= { feature: featureForEntityType(item.entityType), level: screen.required.level || 'read' };
    for (const item of screen.regions) {
      if (!screen.sources.some(candidate => candidate.id === item.sourceId)) item.sourceId = source.id;
      item.actions ||= [];
    }
    return { source, region };
  }

  function ensureSource(screen) {
    screen.sources ||= [];
    if (!screen.sources.length) {
      const entityType = screen.entityType || defaultEntityType();
      const mode = screen.template === 'entityDetail' || screen.template === 'formAction' ? 'single' : 'list';
      screen.sources.push(createSource(screen, entityType || 'source', entityType, mode));
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
    const entityType = screen.entityType || defaultEntityType();
    const id = uniqueId('source', screen.sources);
    const mode = screen.template === 'entityDetail' || screen.template === 'formAction' ? 'single' : 'list';
    const source = createSource(screen, id, entityType, mode);
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

  function setSourceEntityType(screen, source, entityType) {
    source.entityType = entityType;
    source.required = { ...(source.required || {}), feature: featureForEntityType(entityType) };
    sync(screen);
  }

  function setSourceMode(screen, source, mode) {
    source.mode = mode;
    if (mode === 'single') source.identifier ||= '$assignment.entityId';
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
      childEntityType: source.entityType || '',
      ancestorEntityType: '',
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
    add,
    addLineageBinding,
    addRegion,
    addScalar,
    addSource,
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
    setSourceEntityType,
    setSourceMode,
    sync
  };
}

function createSource(screen, id, entityType, mode) {
  return {
    id,
    label: '',
    entityType,
    mode,
    required: { feature: screen.required?.feature || '', level: screen.required?.level || 'read' },
    identifier: mode === 'single' ? '$assignment.entityId' : null,
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
    surface: screen.template === 'entityDetail' ? 'detail' : 'card',
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
