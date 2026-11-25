// Graph protocol v5 designer round trip (SPEC §20, slice 2): the palette
// creates cts.* records, the catalog resolves their ports through the
// operation-kind twin, producer outputs sync from species records, and
// authored definitions survive the canvas round trip — graphProtocol 5,
// species kinds, kebab type ids — without losing records.
import { describe, it, expect } from 'vitest';
import { PROCESS_DESIGNER_PALETTE_GROUPS, createProcessDesignerContract, syncProcessNodeProducerOutputs } from './designer.js';
import { resolveCatalogNodePorts, getProcessNodeDefinition } from './node-catalog.js';
import { definitionToCanvas, canvasToDefinition, validateRoundTrip } from './transpiler.js';
import { servicesPaletteGroups } from './designer.js';
import {
  createTypeRegistry, projectDomainFromView,
  resolveCtsDefinition
} from '../../cts/src/index.js';
import { cncTypePack } from '../../cts/src/pack/cnc.js';
import { frameworkTypes } from '../../cts/src/pack/framework.js';
import { normalizeProcessDefinition, validateProcessDefinition } from './index.js';

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'designer-roundtrip' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    registry.defineType(declaration);
  }
  return projectDomainFromView(registry, 'org-1');
}

describe('graph protocol v5 designer round trip', () => {
  it('the palette speaks species kinds only for entity-bound operations', () => {
    const groups = Object.fromEntries(PROCESS_DESIGNER_PALETTE_GROUPS.map(group => [group.id, group.items]));
    for (const item of [...groups.operations, ...groups.instances]) {
      // Run-context principals (source.*) are the one non-species family
      // beside the reads — fixed-type values, no binding.
      if (String(item.kind).startsWith('source.')) continue;
      expect(item.kind, item.id).toMatch(/^cts\./);
      expect(getProcessNodeDefinition(item.kind), item.kind).not.toBeNull();
    }
    const readPresets = groups.instances.filter(item => item.kind === 'cts.read').map(item => item.preset.select);
    expect(readPresets).toEqual(['current', 'all', 'find', 'extract', 'parent', 'children', 'related']);
    // The pinned entity rides the literal source (an authored entityRef
    // value); the run-context principals stay the only bound-free sources.
    expect(groups.instances.filter(item => String(item.kind).startsWith('source.')).map(item => item.kind))
      .toEqual(['source.literalItem', 'source.currentUser', 'source.currentOrganization']);
  });

  it('catalog ports resolve native species records without legacy sockets', () => {
    const domain = projectedDomain();
    const context = record => ({
      fieldSchemas: domain.fieldSchemas[record.typeId] || [],
      domain
    });
    const construct = resolveCatalogNodePorts({ kind: 'cts.construct', typeId: 'project', construction: { mode: 'genericCreate' } }, context({ type: 'project' }));
    expect(construct.outputs.some(port => port.type?.base === 'entityRef')).toBe(true);

    const transition = resolveCatalogNodePorts({ kind: 'cts.transition', typeId: 'queue' }, context({ type: 'queue' }));
    expect(transition.inputs.some(port => port.id === 'entity')).toBe(true);

    const read = resolveCatalogNodePorts({ kind: 'cts.read', select: 'parent', typeId: 'sheet' }, context({ type: 'sheet' }));
    expect(read.outputs).toHaveLength(1);

    expect(transition.inputs.map(port => port.id)).toEqual(['in', 'entity', 'note', 'state', 'actors']);
    expect(transition.inputs.some(port => port.id === 'status' || port.id === 'changes')).toBe(false);
    expect(read.inputs.map(port => port.id)).toEqual(['entity']);
    const fieldProjection = resolveCatalogNodePorts(
      { kind: 'cts.field', typeId: 'sheet', field: 'data.source' },
      { domain, fieldSchemas: domain.fieldSchemas.sheet || [] }
    );
    expect(fieldProjection.inputs).toHaveLength(2);
    expect(fieldProjection.inputs[0]).toMatchObject({ id: 'entity', type: { base: 'entityRef', typeId: 'sheet' } });
    expect(fieldProjection.inputs[1]).toMatchObject({ id: 'field', type: { base: 'string' } });
    expect(fieldProjection.outputs[0]).toMatchObject({ id: 'value', type: { base: 'json' } });
  });

  it('producer outputs sync from species records', () => {
    const data = { producerOutputs: {} };
    const outputs = syncProcessNodeProducerOutputs(data, {
      id: 'n1',
      kind: 'cts.construct',
      type: 'project',
      outputs: [{ id: 'result', type: { base: 'entityRef', typeId: 'project' } }]
    });
    expect(outputs).toEqual(['n1:result']);
    expect(data.producerOutputs['n1:result']).toMatchObject({ typeId: 'project' });

    // consumer species mint no outputs
    const consumer = syncProcessNodeProducerOutputs(data, {
      id: 'n2',
      kind: 'cts.mutate',
      type: 'project',
      outputs: [{ id: 'result', type: { base: 'entityRef', typeId: 'project' } }]
    });
    expect(consumer).toEqual([]);
    expect(data.producerOutputs['n2:result']).toBeUndefined();
  });

  it('type reference nodes persist through the canvas and their wires stay declaration-plane', () => {
    const domain = projectedDomain();
    const v5 = {
      schemaVersion: 1,
      dataflowVersion: 4,
      graphProtocol: 5,
      graph: {
        nodes: [
          { id: 'typeNode', type: 'ctsType', position: { x: 0, y: 0 }, data: { typeId: 'sheet' } },
          { id: 'construct', type: 'processNode', data: { refId: 'construct' } }
        ],
        edges: [
          { id: 'bind', source: 'typeNode', target: 'construct', role: 'type' }
        ]
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      stateDefinitions: {},
      valueInputs: {},
      screens: {},
      processNodes: {
        construct: { id: 'construct', kind: 'cts.construct', typeId: 'sheet', construction: { mode: 'genericCreate' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [] } }
      }
    };
    const canvas = definitionToCanvas(structuredClone(v5));
    expect(canvas.nodes.some(node => node.type === 'ctsType' && node.data.typeId === 'sheet')).toBe(true);
    const saved = canvasToDefinition(canvas, structuredClone(v5));
    expect(saved.graph.nodes.some(node => node.type === 'ctsType')).toBe(true);
    expect(saved.graph.edges.some(edge => edge.role === 'type')).toBe(true);
    expect(saved.processNodes.construct.typeId).toBe('sheet');
    expect(validateRoundTrip(saved).ok).toBe(true);

    // Definition-local version records survive the canvas round trip: a
    // save must not wipe activation history or the activated snapshot.
    const versioned = { ...structuredClone(v5), history: [{ at: '2026-09-29T00:00:00.000Z', actor: 'u1', data: { dataflowVersion: 4 } }], activated: { dataflowVersion: 4 } };
    const resaved = canvasToDefinition(definitionToCanvas(structuredClone(versioned)), structuredClone(versioned));
    expect(resaved.history).toEqual(versioned.history);
    expect(resaved.activated).toEqual(versioned.activated);

    // normalization keeps the binding wire with its role: machine
    // vocabulary reads declaration wires from the normalized graph, while
    // every role-classifying consumer (cycle checks, data/control walkers)
    // skips them — a declaration wire is never dataflow.
    const normalized = normalizeProcessDefinition(saved, domain);
    const bindingEdge = (normalized.graph.edges || []).find(edge => edge.id === 'bind');
    expect(bindingEdge?.role).toBe('type');
  });

  it('a class wired to itself (recursive containment) validates without a data cycle', () => {
    const domain = projectedDomain();
    const definition = {
      schemaVersion: 1,
      dataflowVersion: 4,
      graphProtocol: 5,
      graph: {
        nodes: [
          { id: 'cls', type: 'ctsClass', position: { x: 0, y: 0 }, data: { refId: 'cls', typeId: 'assembly', class: 'item' } }
        ],
        edges: [
          { id: 'children:cls-cls', source: 'cls', target: 'cls', sourceHandle: 'output:type', targetHandle: 'input:declare', role: 'type', label: 'children', data: { key: 'parts', onRemove: 'restrict' } }
        ]
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      stateDefinitions: {},
      valueInputs: {},
      screens: {},
      processNodes: {},
      ctsTypes: {
        cls: { id: 'cls', kind: 'class', typeId: 'assembly', class: 'item' }
      }
    };
    const normalized = normalizeProcessDefinition(definition, domain);
    const childrenWire = normalized.graph.edges.find(edge => edge.label === 'children');
    expect(childrenWire?.role).toBe('type');
    const { errors } = validateProcessDefinition(definition, domain);
    expect(errors.some(error => error.includes('graph contains a cycle'))).toBe(false);
  });

  it('registered services appear as palette operators and resolve to their commands', () => {
    const groups = servicesPaletteGroups({
      'nesting.solve': { id: 'nesting.solve', command: 'solveNestingValue', render: { label: 'Nesting solver', icon: 'pi pi-compass' } },
      'no-command': { id: 'no-command', render: { label: 'Incomplete' } }
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('services');
    const [item] = groups[0].items;
    expect(item.kind).toBe('cts.service');
    expect(item.preset).toEqual({ operator: 'nesting.solve' });

    const domain = projectedDomain();
    const { definition: resolved, diagnostics } = resolveCtsDefinition({
      processNodes: {
        solve: { id: 'solve', kind: 'cts.service', operator: 'nesting.solve', trigger: { mode: 'manual' } },
        ghost: { id: 'ghost', kind: 'cts.service', operator: 'algebra.solve', trigger: { mode: 'manual' } }
      }
    }, { ...domain, serviceContracts: { 'nesting.solve': { command: 'solveNestingValue' } } });
    expect(resolved.processNodes.solve).toMatchObject({ kind: 'cts.service', commandId: 'solveNestingValue' });
    expect(diagnostics).toContainEqual(expect.stringMatching(/unknown service operator algebra.solve/));
  });


  it('declaration nodes and wires persist with the draft through the canvas round trip', () => {
    const canvas = {
      nodes: [
        { id: 'c1', type: 'ctsClass', position: { x: 0, y: 0 }, data: { refId: 'c1', typeId: 'panel', class: 'item', payload: null, operators: [] } },
        { id: 'f1', type: 'ctsField', position: { x: 260, y: 0 }, data: { refId: 'f1', typeId: 'panel', name: 'width', descriptor: { base: 'quantity', unit: 'mm' } } },
        { id: 's1', type: 'ctsState', position: { x: 260, y: 120 }, data: { refId: 's1', typeId: 'panel', value: 'raw', initial: true, terminal: false } }
      ],
      edges: [
        { id: 'declares:f1-c1', source: 'f1', target: 'c1', role: 'type', label: 'field' },
        { id: 'declares:s1-c1', source: 's1', target: 'c1', role: 'type', label: 'state' }
      ]
    };
    const definition = canvasToDefinition(canvas, normalizeProcessDefinition({ dataflowVersion: 4 }));
    expect(Object.keys(definition.ctsTypes).sort()).toEqual(['c1', 'f1', 's1']);
    expect(definition.ctsTypes.f1).toMatchObject({ kind: 'field', typeId: 'panel', name: 'width' });
    expect(definition.graph.nodes.map(node => node.type).sort()).toEqual(['ctsClass', 'ctsField', 'ctsState']);
    // declaration wires persist as graph gestures through normalization,
    // classified by role — never dataflow
    expect(definition.graph.edges.filter(edge => edge.role === 'type')).toHaveLength(2);

    const reloaded = definitionToCanvas(definition);
    expect(reloaded.nodes.map(node => node.type).sort()).toEqual(['ctsClass', 'ctsField', 'ctsState']);
    expect(reloaded.edges.filter(edge => edge.role === 'type')).toHaveLength(2);
    const roundTrip = canvasToDefinition(reloaded, definition);
    expect(Object.keys(roundTrip.ctsTypes).sort()).toEqual(['c1', 'f1', 's1']);
  });

  it('field display tokens and the class glyph survive the canvas round trip', () => {
    const canvas = {
      nodes: [
        {
          id: 'c1', type: 'ctsClass', position: { x: 0, y: 0 },
          data: { refId: 'c1', typeId: 'panel', class: 'item', name: 'Panel', glyph: 'pi pi-star', payload: null, operators: [] }
        },
        {
          id: 'f1', type: 'ctsField', position: { x: 260, y: 0 },
          data: {
            refId: 'f1', typeId: 'panel', name: 'Serial',
            descriptor: {
              base: 'string', label: 'Serial number', display: 'code', control: 'textarea',
              identifier: true, depiction: true
            }
          }
        }
      ],
      edges: [
        { id: 'declares:f1-c1', source: 'f1', target: 'c1', role: 'type', label: 'field' }
      ]
    };
    const definition = canvasToDefinition(canvas, normalizeProcessDefinition({ dataflowVersion: 4 }));
    expect(definition.ctsTypes.c1).toMatchObject({ kind: 'class', name: 'Panel', glyph: 'pi pi-star' });
    expect(definition.ctsTypes.f1.descriptor).toEqual({
      base: 'string', label: 'Serial number', display: 'code', control: 'textarea',
      identifier: true, depiction: true
    });

    const reloaded = definitionToCanvas(definition);
    const glyphNode = reloaded.nodes.find(node => node.type === 'ctsClass');
    const fieldNode = reloaded.nodes.find(node => node.type === 'ctsField');
    expect(glyphNode.data.glyph).toBe('pi pi-star');
    expect(fieldNode.data.descriptor).toEqual(canvas.nodes[1].data.descriptor);

    // A glyph-less class (the legacy stored shape: no key anywhere)
    // normalizes to null on both halves, so a stored record without one
    // still round-trips byte-identical.
    const bareClassData = { ...canvas.nodes[0].data };
    delete bareClassData.glyph;
    const bare = canvasToDefinition({
      nodes: [{ ...canvas.nodes[0], data: bareClassData }],
      edges: canvas.edges
    }, normalizeProcessDefinition({ dataflowVersion: 4 }));
    expect(bare.ctsTypes.c1.glyph).toBeNull();
    const bareReload = definitionToCanvas(bare);
    expect(bareReload.nodes.find(node => node.type === 'ctsClass').data.glyph).toBeNull();
    expect(canvasToDefinition(bareReload, bare).ctsTypes.c1.glyph).toBeNull();
  });
});
