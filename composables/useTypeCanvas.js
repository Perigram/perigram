// Type-canvas projection (SPEC §20/§21, slice B): declarations ARE nodes.
// Types, fields, and states are canvas nodes; transitions are state-to-state
// wires with intents; children/relations are type-to-type wires. The canvas
// compiles back into registry declarations — the form editor is demoted to
// node inspectors.
//
// Pure functions only: the page owns VueFlow state, this module owns the
// vocabulary and the round trip.

const CLASSES = Object.freeze(['file', 'item', 'group', 'process']);

export const FIELD_BASES = Object.freeze(['string', 'number', 'boolean', 'instant', 'json', 'quantity', 'ref', 'list', 'map', 'enum']);

// -- declarations -> canvas --

export function canvasFromDeclarations(declarations = []) {
  const nodes = [];
  const edges = [];
  const typesByClass = new Map(CLASSES.map(classOf => [classOf, []]));
  for (const declaration of declarations) {
    if (!typesByClass.has(declaration.class)) typesByClass.set(declaration.class, []);
    typesByClass.get(declaration.class).push(declaration);
  }

  const columnFor = classOf => CLASSES.indexOf(classOf);
  let maxColumnRows = 0;
  const rowsByColumn = new Map();

  for (const [classOf, classTypes] of typesByClass) {
    const column = columnFor(classOf);
    rowsByColumn.set(column, 0);
    classTypes.forEach((declaration, index) => {
      const row = index;
      rowsByColumn.set(column, Math.max(rowsByColumn.get(column) || 0, row + 1));
      const base = { x: 40 + column * 460, y: 40 + row * 620 };
      nodes.push({
        id: `type:${declaration.id}`,
        type: 'typeNode',
        position: { ...base },
        data: {
          typeId: declaration.id,
          class: declaration.class,
          scope: declaration.scope,
          label: declaration.render?.label || declaration.id,
          payload: declaration.payload || null,
          version: declaration.version
        }
      });

      Object.entries(declaration.fields || {}).forEach(([name, descriptor], fieldIndex) => {
        const fieldId = `field:${declaration.id}:${name}`;
        nodes.push({
          id: fieldId,
          type: 'fieldNode',
          position: { x: base.x + 250, y: base.y + 30 + fieldIndex * 64 },
          data: { typeId: declaration.id, name, descriptor: { ...descriptor } }
        });
        edges.push({
          id: `declares-field:${fieldId}`,
          source: fieldId,
          target: `type:${declaration.id}`,
          role: 'declares'
        });
      });

      const states = declaration.states?.main?.values || [];
      states.forEach((value, stateIndex) => {
        const stateId = `state:${declaration.id}:${value}`;
        nodes.push({
          id: stateId,
          type: 'stateNode',
          position: { x: base.x + 250, y: base.y + 210 + stateIndex * 76 },
          data: {
            typeId: declaration.id,
            value,
            initial: value === declaration.states?.main?.initial,
            terminal: (declaration.states?.main?.terminal || []).includes(value)
          }
        });
        edges.push({
          id: `declares-state:${stateId}`,
          source: stateId,
          target: `type:${declaration.id}`,
          role: 'declares'
        });
      });

      (declaration.transitions || []).forEach((transition, transitionIndex) => {
        edges.push({
          id: `transition:${declaration.id}:${transition.from}:${transitionIndex}:${transition.to}`,
          source: `state:${declaration.id}:${transition.from}`,
          target: `state:${declaration.id}:${transition.to}`,
          role: 'transition',
          data: { intent: transition.intent || '' }
        });
      });

      for (const [key, childDeclaration] of Object.entries(declaration.edges?.children || {})) {
        for (const childType of childDeclaration.types || []) {
          edges.push({
            id: `children:${declaration.id}:${childType}`,
            source: `type:${declaration.id}`,
            target: `type:${childType}`,
            role: 'children',
            data: { key }
          });
        }
      }
    });
    maxColumnRows = Math.max(maxColumnRows, rowsByColumn.get(column) || 0);
  }

  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 0.75 } };
}

// -- canvas -> declarations --
//
// Compiles the canvas back: field/state nodes attach through their declares
// wires, transitions are state wires (intent carried on the edge), children
// are type wires. Non-structural facets (payload, render, operators) are
// carried over from the loaded declarations; system types are returned
// untouched (they compile from packs and are read-only).
export function declarationsFromCanvas(canvas = {}, loadedDeclarations = []) {
  const loadedById = new Map(loadedDeclarations.map(declaration => [declaration.id, declaration]));
  const editableTypes = new Set(
    canvas.nodes
      .filter(node => node.type === 'typeNode' && (node.data?.scope !== 'system'))
      .map(node => node.data.typeId)
  );

  const fieldsByType = new Map();
  const statesByType = new Map();
  const transitionsByType = new Map();
  const childrenByType = new Map();

  for (const node of canvas.nodes || []) {
    if (node.type === 'fieldNode' && editableTypes.has(node.data?.typeId)) {
      const map = fieldsByType.get(node.data.typeId) || new Map();
      const name = String(node.data.name || '').trim();
      if (name) map.set(name, { ...node.data.descriptor });
      fieldsByType.set(node.data.typeId, map);
    }
    if (node.type === 'stateNode' && editableTypes.has(node.data?.typeId)) {
      const map = statesByType.get(node.data.typeId) || new Map();
      const value = String(node.data.value || '').trim();
      if (value) {
        map.set(value, {
          initial: node.data.initial === true,
          terminal: node.data.terminal === true
        });
      }
      statesByType.set(node.data.typeId, map);
    }
  }

  for (const edge of canvas.edges || []) {
    const [sourceKind, sourceType, sourceName] = String(edge.source || '').split(':');
    const [targetKind, targetType] = String(edge.target || '').split(':');
    if (edge.role === 'transition' && sourceKind === 'state' && targetKind === 'state' && sourceType === targetType && editableTypes.has(sourceType)) {
      const list = transitionsByType.get(sourceType) || [];
      list.push({ from: sourceName, to: String(edge.target || '').split(':')[2], ...(edge.data?.intent ? { intent: String(edge.data.intent).trim() } : {}) });
      transitionsByType.set(sourceType, list);
    }
    if (edge.role === 'children' && sourceKind === 'type' && targetKind === 'type' && editableTypes.has(sourceType)) {
      const map = childrenByType.get(sourceType) || new Map();
      const key = String(edge.data?.key || `${targetType}s`).trim();
      const entry = map.get(key) || { types: [], onRemove: 'restrict' };
      entry.types.push(targetType);
      map.set(key, entry);
      childrenByType.set(sourceType, map);
    }
  }

  const compiled = [];
  const diagnostics = [];
  for (const typeId of editableTypes) {
    const loaded = loadedById.get(typeId) || null;
    const classOf = canvas.nodes.find(node => node.type === 'typeNode' && node.data?.typeId === typeId)?.data?.class;
    if (!classOf) {
      diagnostics.push(`type ${typeId}: missing class`);
      continue;
    }
    const declaration = {
      id: typeId,
      class: classOf,
      scope: 'org',
      fields: Object.fromEntries([...(fieldsByType.get(typeId) || new Map()).entries()].map(([name, descriptor]) => [name, normalizeDescriptor(descriptor)])),
      ...(loaded?.organizationId ? { organizationId: loaded.organizationId } : {})
    };
    for (const facet of ['payload', 'render', 'operators']) {
      if (loaded?.[facet]) declaration[facet] = loaded[facet];
    }
    const states = statesByType.get(typeId) || new Map();
    if (states.size) {
      const values = [...states.keys()];
      const initial = [...states.entries()].find(([, flags]) => flags.initial)?.[0] || values[0];
      declaration.states = {
        main: {
          initial,
          values,
          terminal: [...states.entries()].filter(([, flags]) => flags.terminal).map(([value]) => value)
        }
      };
      const declared = new Set(values);
      declaration.transitions = (transitionsByType.get(typeId) || [])
        .filter(transition => declared.has(transition.from) && declared.has(transition.to))
        .map(({ from, to, intent }) => (intent ? { from, to, intent } : { from, to }));
    }
    const children = childrenByType.get(typeId);
    if (children?.size) {
      declaration.edges = { children: Object.fromEntries(children.entries()) };
    }
    compiled.push(declaration);
  }

  return { declarations: compiled, diagnostics };
}

function normalizeDescriptor(descriptor = {}) {
  const clean = { ...descriptor };
  delete clean.label;
  delete clean.i18n;
  delete clean.display;
  delete clean.role;
  delete clean.slot;
  return clean;
}

// A kebab-case id for a freshly declared type.
export function suggestTypeId(existing = [], classOf = 'file') {
  const taken = new Set(existing);
  let index = 1;
  while (taken.has(`${classOf}-${index}`)) index += 1;
  return `${classOf}-${index}`;
}

export const TYPE_CANVAS_CLASSES = CLASSES;
