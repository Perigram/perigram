import { describe, expect, it } from 'vitest';
import { inferProcessDataflowContracts, portSpecsCompatible, resolveNodePort, resolveProcessNodePorts, validateProcessEdges } from './ports.js';
import { processSocketsCompatible } from './types.js';
import { registerProcessPortCompatibilityProfile, PROCESS_PORT_COMPATIBILITY_PROFILE } from './port-compatibility.js';

describe('process programming node ports', () => {
  it('gives every string operation its actual input arity and scalar types', () => {
    expect(resolveProcessNodePorts({ kind: 'stringOp', operation: 'concat' })).toEqual({
      inputs: [
        expect.objectContaining({ id: 'value', label: 'left', kind: 'string', required: true }),
        expect.objectContaining({ id: 'right', kind: 'string', required: true })
      ],
      outputs: [expect.objectContaining({ id: 'value', kind: 'string' })]
    });
    expect(resolveProcessNodePorts({ kind: 'stringOp', operation: 'replace' }).inputs)
      .toEqual([
        expect.objectContaining({ id: 'value', kind: 'string' }),
        expect.objectContaining({ id: 'search', kind: 'string' }),
        expect.objectContaining({ id: 'replacement', kind: 'string' })
      ]);
  });

  it('uses operation-specific comparison and logic contracts', () => {
    expect(resolveProcessNodePorts({ kind: 'compare', operation: 'gt' }).inputs)
      .toEqual([
        expect.objectContaining({ id: 'left', kind: 'number' }),
        expect.objectContaining({ id: 'right', kind: 'number' })
      ]);
    expect(resolveProcessNodePorts({ kind: 'logic', operation: 'not' }).inputs)
      .toEqual([expect.objectContaining({ id: 'left', label: 'value', kind: 'boolean' })]);
    expect(resolveProcessNodePorts({ kind: 'logic', operation: 'xor', structure: 'list' }))
      .toEqual({
        inputs: [
          expect.objectContaining({ id: 'left', kind: 'boolean_list' }),
          expect.objectContaining({ id: 'right', kind: 'boolean_list' })
        ],
        outputs: [expect.objectContaining({ id: 'result', kind: 'boolean_list' })]
      });
  });

  it('keeps missing-value fallback in the value family and broadcasts one fallback over a list', () => {
    expect(resolveProcessNodePorts({ kind: 'fallback', valueType: 'string', structure: 'list' })).toEqual({
      inputs: [
        expect.objectContaining({ id: 'value', kind: 'string_list' }),
        expect.objectContaining({ id: 'fallback', kind: 'string' })
      ],
      outputs: [expect.objectContaining({ id: 'value', kind: 'string_list' })]
    });
  });

  it('rejects wiring unlike scalar types while allowing typed values into generic data inputs', () => {
    expect(portSpecsCompatible({ kind: 'string' }, { kind: 'number' }).ok).toBe(false);
    expect(portSpecsCompatible({ kind: 'string' }, { kind: 'data' }).ok).toBe(true);
  });

  it('honors the wire law: the validator accepts what the canvas gate accepts', () => {
    const socket = (id, type) => ({ id, label: id, type, role: 'data' });
    for (const [name, source, target] of [
      ['dateTime -> string (temporalToString)', socket('value', { base: 'dateTime' }), socket('left', { base: 'string' })],
      ['integer -> number (integerToNumber)', socket('value', { base: 'integer' }), socket('left', { base: 'number' })],
      ['same unit numbers', socket('value', { base: 'number', unit: 'mm' }), socket('left', { base: 'number', unit: 'mm' })]
    ]) {
      expect(processSocketsCompatible(source, target).ok, name).toBe(true);
      expect(portSpecsCompatible(source, target).ok, name).toBe(true);
    }
    // Refusals agree too, and the diagnostic names the types.
    expect(portSpecsCompatible(socket('value', { base: 'dateTime' }), socket('left', { base: 'number' })).ok).toBe(false);
    // Unit mismatches refuse on both gates: a conversion the factor table
    // expresses stays explicit, a unit pair outside it names both units.
    const mmToM = portSpecsCompatible(socket('value', { base: 'number', unit: 'mm' }), socket('left', { base: 'number', unit: 'm' }));
    expect(processSocketsCompatible(socket('value', { base: 'number', unit: 'mm' }), socket('left', { base: 'number', unit: 'm' })).ok).toBe(false);
    expect(mmToM.ok).toBe(false);
    expect(mmToM.convertible).toBe(true);
    expect(mmToM.conversion).toMatchObject({ nodeKind: 'value.convertUnit' });
    const mmToDeg = portSpecsCompatible(socket('value', { base: 'number', unit: 'mm' }), socket('left', { base: 'number', unit: 'deg' }));
    expect(processSocketsCompatible(socket('value', { base: 'number', unit: 'mm' }), socket('left', { base: 'number', unit: 'deg' })).ok).toBe(false);
    expect(mmToDeg.ok).toBe(false);
    expect(mmToDeg.convertible).toBe(false);
    expect(mmToDeg.reason).toContain('mm');
    expect(mmToDeg.reason).toContain('deg');
  });

  it('keeps same-kind semantic checks behind the kind lattice', () => {
    // Units and value kinds are semantic qualifiers of the same base kind:
    // kind equality alone connects nothing.
    expect(portSpecsCompatible(
      { id: 'value', kind: 'number', type: { base: 'number', nullable: false, unit: 'mm' } },
      { id: 'left', kind: 'number', type: { base: 'number', nullable: false, unit: 'm' } }
    ).ok).toBe(false);
    expect(portSpecsCompatible(
      { id: 'value', kind: 'json', type: { base: 'json', nullable: false } },
      { id: 'left', kind: 'json', type: { base: 'json', nullable: false, kind: 'document.report' } }
    ).ok).toBe(false);
    expect(portSpecsCompatible(
      { id: 'value', kind: 'json', type: { base: 'json', nullable: false, kind: 'document.report' } },
      { id: 'left', kind: 'json', type: { base: 'json', nullable: false, kind: 'document.report' } }
    ).ok).toBe(true);
    // Unit-less scalar ports keep today's outcomes.
    expect(portSpecsCompatible({ kind: 'number' }, { kind: 'number' }).ok).toBe(true);
    expect(portSpecsCompatible({ kind: 'string' }, { kind: 'number' }).ok).toBe(false);
  });

  it('exposes a status definition as a typed status output', () => {
    const output = resolveNodePort({
      stateDefinitions: {
        ready: { id: 'ready', stateId: 'READY', label: 'Ready' }
      }
    }, {
      id: 'ready',
      type: 'stateDefinition',
      data: { refId: 'ready' }
    }, 'data:status', 'output');

    expect(output).toMatchObject({
      id: 'status',
      label: 'Ready',
      kind: 'status'
    });
    expect(portSpecsCompatible(output, { id: 'target', kind: 'status' }).ok).toBe(true);
    expect(portSpecsCompatible(output, { id: 'target', kind: 'number' }).ok).toBe(false);
  });

  it('connects a status definition to a structured v3 status input', () => {
    const process = {
      stateDefinitions: {
        ready: { id: 'ready', stateId: 'READY', label: 'Ready' }
      },
      processNodes: {
        create: {
          id: 'create',
          kind: 'effect.createEntity',
          inputs: [{
            id: 'states.main',
            type: { base: 'status', shape: 'item', typeId: 'project' },
            role: 'data'
          }]
        }
      },
      graph: {
        nodes: [
          { id: 'ready', type: 'stateDefinition', data: { refId: 'ready' } },
          { id: 'create', type: 'processNode', data: { refId: 'create' } }
        ],
        edges: [{
          id: 'ready-create-status',
          source: 'ready',
          sourceHandle: 'data:status',
          target: 'create',
          targetHandle: 'data:states.main'
        }]
      }
    };

    expect(resolveNodePort(process, process.graph.nodes[1], 'data:states.main', 'input'))
      .toMatchObject({ kind: 'status', typeId: 'project' });
    expect(validateProcessEdges(process)).toEqual([]);
  });

  it('anchors incompatible edges so the designer can focus them', () => {
    const process = {
      processNodes: {
        rows: {
          id: 'rows',
          kind: 'value.recordField',
          outputs: [{ id: 'value', type: { base: 'json', nullable: true }, role: 'data', access: 'list' }]
        },
        flatten: {
          id: 'flatten',
          kind: 'tree.flatten',
          type: { base: 'string', nullable: true },
          inputs: [{ id: 'value', type: { base: 'string', nullable: true }, role: 'data', required: true, access: 'tree' }]
        }
      },
      graph: {
        nodes: [
          { id: 'rows', type: 'processNode', data: { refId: 'rows' } },
          { id: 'flatten', type: 'processNode', data: { refId: 'flatten' } }
        ],
        edges: [{
          id: 'rows-flatten',
          source: 'rows',
          sourceHandle: 'data:value',
          target: 'flatten',
          targetHandle: 'data:value'
        }]
      }
    };

    const [diagnostic] = validateProcessEdges(process);
    expect(diagnostic).toMatchObject({
      edgeId: 'rows-flatten',
      nodeId: 'flatten',
      socketId: 'value'
    });
    expect(diagnostic.message).toMatch('connects incompatible ports');
  });

  it('infers relation entries from typed operational-node outputs', () => {
    const process = {
      processNodes: {
        library: {
          id: 'library',
          kind: 'effect.createEntity',
          typeId: 'library'
        },
        relations: {
          id: 'relations',
          kind: 'record.composeBlock',
          compositionMode: 'relations',
          entries: [{ id: 'library', key: 'library', typeId: 'library', cardinality: 'one' }]
        }
      },
      graph: {
        nodes: ['library', 'relations'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [{
          source: 'library',
          sourceHandle: 'data:result',
          target: 'relations',
          targetHandle: 'data:entry:library'
        }]
      }
    };

    expect(inferProcessDataflowContracts(process).processNodes.relations.entries[0]).toMatchObject({
      key: 'library',
      typeId: 'library',
      cardinality: 'one'
    });
  });

  it('resolves persisted structured v3 ports without a node-kind adapter', () => {
    const process = {
      processNodes: {
        effect: {
          id: 'effect',
          kind: 'effect.createEntity',
          outputs: [{ id: 'result', type: { base: 'entity', shape: 'item', typeId: 'library' }, role: 'data' }]
        }
      }
    };
    const output = resolveNodePort(process, {
      id: 'effect',
      type: 'processNode',
      data: { refId: 'effect' }
    }, 'data:result', 'output');

    expect(output).toMatchObject({ kind: 'entity', typeId: 'library' });
  });

  it('preserves list structure through entity projection, predicates, and filtering', () => {
    expect(resolveProcessNodePorts({ kind: 'entityQuery', typeId: 'queue' }).outputs)
      .toEqual([expect.objectContaining({ id: 'entities', kind: 'entity_list', typeId: 'queue' })]);
    expect(resolveProcessNodePorts({
      kind: 'entityField',
      typeId: 'queue',
      path: 'states.main',
      valueType: 'string',
      structure: 'list'
    })).toEqual({
      inputs: [expect.objectContaining({ id: 'entity', kind: 'entity_list' })],
      outputs: [expect.objectContaining({ id: 'value', kind: 'string_list' })]
    });
    expect(resolveProcessNodePorts({ kind: 'entityFilter', typeId: 'queue' }).inputs)
      .toEqual([
        expect.objectContaining({ id: 'entities', kind: 'entity_list' }),
        expect.objectContaining({ id: 'predicate', kind: 'predicate', typeId: 'queue' })
      ]);
  });

  it('models entity filtering as typed predicates instead of parallel masks', () => {
    expect(resolveProcessNodePorts({
      kind: 'entityCondition',
      typeId: 'queue',
      path: 'states.main',
      operation: 'eq',
      valueType: 'string'
    })).toEqual({
      inputs: [expect.objectContaining({ id: 'value', kind: 'string' })],
      outputs: [expect.objectContaining({ id: 'predicate', kind: 'predicate', typeId: 'queue' })]
    });
    expect(resolveProcessNodePorts({
      kind: 'predicateLogic',
      typeId: 'queue',
      operation: 'and'
    }).inputs).toEqual([
      expect.objectContaining({ id: 'left', kind: 'predicate', typeId: 'queue' }),
      expect.objectContaining({ id: 'right', kind: 'predicate', typeId: 'queue' })
    ]);
    expect(portSpecsCompatible(
      { kind: 'predicate', typeId: 'queue' },
      { kind: 'predicate', typeId: 'project' }
    ).ok).toBe(false);
  });

  it('derives list shape and scalar type from graph wiring', () => {
    const process = inferProcessDataflowContracts({
      valueInputs: {},
      processNodes: {
        query: { id: 'query', kind: 'entityQuery', typeId: 'queue' },
        field: { id: 'field', kind: 'entityField', typeId: 'queue', path: 'summary.totalArea', valueType: 'number', structure: 'item' },
        compare: { id: 'compare', kind: 'compare', operation: 'gte', valueType: 'string', structure: 'item' },
        cast: { id: 'cast', kind: 'cast', valueType: 'string', structure: 'item' }
      },
      graph: {
        nodes: ['query', 'field', 'compare', 'cast'].map(id => ({ id, type: 'processNode' })),
        edges: [
          { source: 'query', target: 'field' },
          { source: 'field', target: 'compare', targetHandle: 'input:left' },
          { source: 'compare', target: 'cast' }
        ]
      }
    });

    expect(process.processNodes.field.structure).toBe('list');
    expect(process.processNodes.compare).toMatchObject({ structure: 'list', valueType: 'number' });
    expect(process.processNodes.cast.structure).toBe('list');
  });
  it('registers CTS socket semantics through the provider-neutral compatibility contract', () => {
    let registeredProfile = null;
    let registeredComparator = null;
    const registry = {
      register(id, compare) {
        registeredProfile = id;
        registeredComparator = compare;
        return () => {};
      }
    };
    registerProcessPortCompatibilityProfile(registry);
    expect(registeredProfile).toBe(PROCESS_PORT_COMPATIBILITY_PROFILE);
    expect(registeredComparator(
      { id: 'entity', kind: 'entity', typeId: 'part' },
      { id: 'entity', kind: 'entity', typeId: 'part' }
    )).toMatchObject({ status: 'exact', compatible: true });
    expect(registeredComparator(
      { id: 'entity', kind: 'entity', typeId: 'part' },
      { id: 'entity', kind: 'entity', typeId: 'customer' }
    )).toMatchObject({ status: 'incompatible', compatible: false });
    expect(registeredComparator(
      { id: 'entity', shape: 'item', semantic: { base: 'entity', kind: 'entity', typeId: 'part' } },
      { id: 'entity', shape: 'item', semantic: { base: 'entity', kind: 'entity', typeId: 'customer' } }
    )).toMatchObject({ status: 'incompatible', compatible: false });
  });

  it('reports the registry outcome vocabulary with the profile result shape', () => {
    let comparator = null;
    registerProcessPortCompatibilityProfile({
      register(id, compare) {
        comparator = compare;
        return () => {};
      }
    });
    const port = (id, type) => ({ id, type, role: 'data' });
    const requireShape = (result) => {
      expect(Object.keys(result)).toEqual(expect.arrayContaining(['status', 'compatible', 'reason', 'conversions']));
      expect(typeof result.compatible).toBe('boolean');
      expect(typeof result.reason).toBe('string');
      expect(Array.isArray(result.conversions)).toBe(true);
      return result;
    };

    const exact = requireShape(comparator(
      port('value', { base: 'number', nullable: false, unit: 'mm' }),
      port('left', { base: 'number', nullable: false, unit: 'mm' })
    ));
    expect(exact.status).toBe('exact');
    expect(exact.compatible).toBe(true);

    const coerced = requireShape(comparator(
      port('value', { base: 'integer', nullable: false }),
      port('left', { base: 'number', nullable: false })
    ));
    expect(coerced.status).toBe('safe-coercion');
    expect(coerced.compatible).toBe(true);

    const conversion = requireShape(comparator(
      port('value', { base: 'number', nullable: false, unit: 'mm' }),
      port('left', { base: 'number', nullable: false, unit: 'm' })
    ));
    expect(conversion.status).toBe('conversion-required');
    expect(conversion.compatible).toBe(false);
    expect(conversion.reason).toContain('mm');
    expect(conversion.reason).toContain('m');
    expect(conversion.conversions).toEqual([]);
    expect(conversion.conversion).toMatchObject({
      nodeKind: 'value.convertUnit',
      sourceType: { base: 'number', unit: 'mm' },
      targetType: { base: 'number', unit: 'm' }
    });

    const incompatible = requireShape(comparator(
      port('value', { base: 'number', nullable: false, unit: 'mm' }),
      port('left', { base: 'number', nullable: false, unit: 'deg' })
    ));
    expect(incompatible.status).toBe('incompatible');
    expect(incompatible.compatible).toBe(false);
    expect(incompatible.reason).toContain('mm');
    expect(incompatible.reason).toContain('deg');
    expect(incompatible.conversion).toBeUndefined();
  });

});
