// Per-state field policy (CTS SPEC §7 `fieldPolicy`, §10): the facet's
// normalization home, draft diagnostics, the canvas round trip, and the
// compiled workflow states it rides.
import { describe, expect, it } from 'vitest';
import { createTypeRegistry, projectDomainFromView } from '../../cts/src/index.js';
import { normalizeStateFieldPolicy, compileTreeDeclarations } from './designer.js';
import { canvasToDefinition, definitionToCanvas } from './transpiler.js';
import { compileProcessDefinition } from './compiler-core.js';

describe('normalizeStateFieldPolicy', () => {
  it('keeps authored lists (empty list included) and drops everything else', () => {
    expect(normalizeStateFieldPolicy({ visible: ['a', 'a', 'b'], editable: [] }))
      .toEqual({ visible: ['a', 'b'], editable: [] });
    expect(normalizeStateFieldPolicy({ visible: 'yes' })).toBeNull();
    expect(normalizeStateFieldPolicy({})).toBeNull();
    expect(normalizeStateFieldPolicy(null)).toBeNull();
  });
});

describe('state field-policy draft diagnostics', () => {
  const classNode = { id: 'cls', type: 'ctsClass', position: { x: 0, y: 0 }, data: { refId: 'cls', typeId: 'panel', class: 'item' } };
  const fieldNode = id => ({ id, type: 'ctsField', position: { x: 0, y: 120 }, data: { refId: id, typeId: 'panel', name: id, descriptor: { base: 'string' } } });
  const stateNode = (id, fieldPolicy) => ({
    id, type: 'ctsState', position: { x: 0, y: 240 },
    data: { refId: id, typeId: 'panel', value: id, ...(fieldPolicy ? { fieldPolicy } : {}) }
  });
  const declareEdge = (source, target = 'cls') => ({
    id: `d:${source}`, source, target, sourceHandle: 'output:state', targetHandle: 'input:declare', role: 'type', label: 'state'
  });

  function diagnosticsFor(nodes) {
    return compileTreeDeclarations(nodes, nodes
      .filter(node => node.type === 'ctsField' || node.type === 'ctsState')
      .map(node => declareEdge(node.id))).diagnostics;
  }

  it('accepts a facet over declared row fields', () => {
    const nodes = [classNode, fieldNode('serial'), fieldNode('width'), stateNode('available', { visible: ['serial', 'width'], editable: ['width'] })];
    expect(diagnosticsFor(nodes)).toEqual([]);
  });

  it('names undeclared fields, non-list shapes, and editable outside visible', () => {
    const nodes = [
      classNode, fieldNode('serial'),
      stateNode('ghosty', { visible: ['ghost'] }),
      stateNode('stringy', { editable: 'serial' }),
      stateNode('cross', { visible: ['serial'], editable: ['width'] })
    ];
    const diagnostics = diagnosticsFor(nodes);
    expect(diagnostics).toContainEqual(expect.stringMatching(/ghosty: fieldPolicy visible names undeclared field ghost/));
    expect(diagnostics).toContainEqual(expect.stringMatching(/stringy: fieldPolicy editable must be a field list/));
    expect(diagnostics).toContainEqual(expect.stringMatching(/cross: fieldPolicy editable names width outside visible/));
  });
});

describe('state field-policy canvas round trip', () => {
  const stateNode = fieldPolicy => ({
    id: 's1', type: 'ctsState', position: { x: 0, y: 0 },
    data: { refId: 'r1', typeId: 'panel', value: 'available', ...(fieldPolicy ? { fieldPolicy } : {}) }
  });

  it('persists the facet and keeps clearing a clean clear', () => {
    const authored = canvasToDefinition({ nodes: [stateNode({ visible: ['serial'], editable: ['serial'] })], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, {});
    expect(authored.ctsTypes.r1.fieldPolicy).toEqual({ visible: ['serial'], editable: ['serial'] });

    const reloaded = definitionToCanvas(authored);
    expect(reloaded.nodes[0].data.fieldPolicy).toEqual({ visible: ['serial'], editable: ['serial'] });

    const cleared = canvasToDefinition({ nodes: [stateNode(null)], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, authored);
    expect(cleared.ctsTypes.r1.fieldPolicy).toBeUndefined();
  });
});

describe('state field-policy compilation onto workflow states', () => {
  function compiledWith(stateRecords) {
    const registry = createTypeRegistry();
    registry.defineType({
      id: 'panel', class: 'item', name: 'Panel',
      fields: { serial: { base: 'string' }, width: { base: 'quantity', unit: 'mm' } }
    });
    const domain = projectDomainFromView(registry, 'org-facet');
    return compileProcessDefinition({
      graphProtocol: 5,
      dataflowVersion: 4,
      graph: {
        nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }],
        edges: []
      },
      roleGrants: {},
      ctsTypes: stateRecords,
      processNodes: {
        create: {
          id: 'create', kind: 'cts.construct', typeId: 'panel',
          producerOutputId: 'create:result',
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
          inputDefaults: { state: 'available' }
        }
      },
      producerOutputs: {
        'create:result': {
          producerOutputId: 'create:result', nodeId: 'create', outputSocketId: 'result',
          typeId: 'panel', lifecycle: { mode: 'domainDefault' },
          fields: { read: ['fields.serial', 'fields.width'], write: [], private: [] }
        }
      },
      actions: {}, services: {}, sockets: {}, screens: {}, stateDefinitions: {}, valueInputs: {}
    }, domain, {});
  }

  it('rides the workflow state', () => {
    const compiled = compiledWith({
      s1: { id: 's1', kind: 'state', typeId: 'panel', value: 'available', fieldPolicy: { visible: ['serial', 'width'], editable: ['width'] } },
      s2: { id: 's2', kind: 'state', typeId: 'panel', value: 'escalated', label: 'Escalated', fieldPolicy: { editable: ['serial'] } },
      s3: { id: 's3', kind: 'state', typeId: 'panel', value: 'quarantined' }
    });
    const states = compiled.producerOutputs['create:result'].workflow.states;
    expect(states.available.fieldPolicy).toEqual({ visible: ['serial', 'width'], editable: ['width'] });
    expect(states.escalated.fieldPolicy).toEqual({ editable: ['serial'] });
    expect(states.escalated.label).toBe('Escalated');
    expect(states.quarantined.fieldPolicy).toBeUndefined();
  });
});
