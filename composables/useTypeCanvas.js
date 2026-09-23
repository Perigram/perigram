// Type-canvas projection (SPEC §20/§21): declarations ARE nodes. Types,
// fields, and states project to canvas nodes; transitions are state-to-state
// wires with intents; children are type-to-type wires. Projection only —
// authoring lives in the process designer tree, so this module owns no
// compile-back. Pure functions: the page owns VueFlow state.
// Grammar lists (bases, classes, units) come from @perigram/cts — single
// home, never restated here.
import { DECLARABLE_CLASSES } from '~/packages/cts/src/index.js';

const CLASSES = DECLARABLE_CLASSES;

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
          label: declaration.name || declaration.id,
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
