import { describe, expect, it, vi } from 'vitest';
import { createDataPacket } from './data-tree.js';
import { applyPatch, evaluateEntityPredicate, executeProcessDataNode, executeProcessEffectNode } from './evaluator.js';

describe('process v4 data execution', () => {
  it.each(['effect.updateEntity', 'effect.changeStatus', 'effect.archiveEntity', 'effect.deleteEntity'])(
    'maps %s over item, list, and branched-tree inputs', async kind => {
    const record = { kind, typeId: 'project' };
    const invoke = vi.fn(async inputs => ({ ...inputs.entity, identity: inputs.identity }));

    const item = await executeProcessEffectNode(record, {
      entity: createDataPacket({ type: 'project', id: 'p1' }),
      identity: createDataPacket({ name: 'One' })
    }, invoke);
    const list = await executeProcessEffectNode(record, {
      entity: createDataPacket([{ type: 'project', id: 'p2' }, { type: 'project', id: 'p3' }], 'list'),
      identity: createDataPacket({ name: 'Broadcast' })
    }, invoke);
    const tree = await executeProcessEffectNode(record, {
      entity: createDataPacket({ branches: [
        { path: [2], items: [{ type: 'project', id: 'p4' }, { type: 'project', id: 'p5' }] },
        { path: [7], items: [{ type: 'project', id: 'p6' }] }
      ] }, 'tree'),
      identity: createDataPacket({ branches: [
        { path: [2], items: [{ name: 'Four' }, { name: 'Five' }] },
        { path: [7], items: [{ name: 'Six' }] }
      ] }, 'tree')
    }, invoke);

    expect(item).toEqual({ type: 'project', id: 'p1', identity: { name: 'One' } });
    expect(list).toEqual({ branches: [{ path: [], items: [
      { type: 'project', id: 'p2', identity: { name: 'Broadcast' } },
      { type: 'project', id: 'p3', identity: { name: 'Broadcast' } }
    ] }] });
    expect(tree).toEqual({ branches: [
      { path: [2], items: [
        { type: 'project', id: 'p4', identity: { name: 'Four' } },
        { type: 'project', id: 'p5', identity: { name: 'Five' } }
      ] },
      { path: [7], items: [{ type: 'project', id: 'p6', identity: { name: 'Six' } }] }
    ] });
  });

  it('preflights incompatible and Cross mutation matching before writing', async () => {
    const invoke = vi.fn();
    const entity = createDataPacket([
      { type: 'project', id: 'p1' },
      { type: 'project', id: 'p2' },
      { type: 'project', id: 'p3' }
    ], 'list');
    const identity = createDataPacket([{ name: 'One' }, { name: 'Two' }], 'list');

    await expect(executeProcessEffectNode(
      { kind: 'effect.updateEntity', typeId: 'project' },
      { entity, identity },
      invoke
    )).rejects.toThrow('items must be scalar or aligned');
    await expect(executeProcessEffectNode(
      { kind: 'effect.updateEntity', typeId: 'project', matching: 'cross' },
      { entity, identity },
      invoke
    )).rejects.toThrow('cannot use Cross matching');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports failed and completed mutations without claiming atomicity', async () => {
    const invoke = vi.fn(async inputs => {
      if (inputs.entity.id === 'p2') throw Object.assign(new Error('write denied'), { code: 'DENIED' });
      return { ...inputs.entity, identity: inputs.identity };
    });
    const result = await executeProcessEffectNode(
      { kind: 'effect.changeStatus', typeId: 'project' },
      {
        entity: createDataPacket([
          { type: 'project', id: 'p1' },
          { type: 'project', id: 'p2' },
          { type: 'project', id: 'p3' }
        ], 'list'),
        identity: createDataPacket([{ name: 'One' }, { name: 'Two' }, { name: 'Three' }], 'list')
      },
      invoke
    );

    const expectedFailure = {
      operation: 'effect.changeStatus',
      branchPath: [],
      itemIndex: 1,
      entityRef: { type: 'project', id: 'p2' },
      error: { name: 'Error', message: 'write denied', code: 'DENIED' }
    };
    expect(result.failures).toEqual([expectedFailure]);
    expect(result.result.branches[0].items).toEqual([
      { type: 'project', id: 'p1', identity: { name: 'One' } },
      expectedFailure,
      { type: 'project', id: 'p3', identity: { name: 'Three' } }
    ]);
    expect(result.completedMutations).toEqual([
      { operation: 'effect.changeStatus', branchPath: [], itemIndex: 0, entityRef: { type: 'project', id: 'p1' } },
      { operation: 'effect.changeStatus', branchPath: [], itemIndex: 2, entityRef: { type: 'project', id: 'p3' } }
    ]);
  });

  it('carries a single failed item in the failure-carrying output', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('write denied');
    });
    const result = await executeProcessEffectNode(
      { kind: 'effect.updateEntity', typeId: 'project' },
      { entity: createDataPacket({ type: 'project', id: 'p1' }) },
      invoke
    );

    expect(result.completedMutations).toEqual([]);
    expect(result.failures).toEqual([{
      operation: 'effect.updateEntity',
      branchPath: [],
      itemIndex: 0,
      entityRef: { type: 'project', id: 'p1' },
      error: { name: 'Error', message: 'write denied' }
    }]);
    expect(result.result.branches[0].items[0]).toEqual(result.failures[0]);
  });

  it('evaluates current time from the runtime clock when accessed', async () => {
    const now = vi.fn(() => new Date('2026-08-04T12:34:56.000Z'));
    const result = await executeProcessDataNode({ kind: 'source.currentTime' }, {}, { now });

    expect(now).toHaveBeenCalledOnce();
    expect(result.branches[0].items).toEqual(['2026-08-04T12:34:56.000Z']);
  });

  it('broadcasts an item over aligned list values', async () => {
    const result = await executeProcessDataNode(
      { kind: 'value.math', operation: 'multiply' },
      { left: createDataPacket([2, 3], 'list'), right: createDataPacket(10) }
    );
    expect(result.branches[0].items).toEqual([20, 30]);
  });

  it('keeps entity predicates declarative and filters in read context', async () => {
    const predicate = { kind: 'field', typeId: 'sheet', path: 'specs.width', operation: 'gte', value: 100 };
    expect(evaluateEntityPredicate(predicate, { specs: { width: 120 } })).toBe(true);
    const queryEntities = vi.fn().mockResolvedValue([{ id: 'wide' }]);
    const result = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'sheet' },
      { predicate: createDataPacket(predicate) },
      { queryEntities }
    );
    expect(queryEntities).toHaveBeenCalledWith('sheet', predicate);
    expect(result.branches[0].items).toEqual([{ id: 'wide' }]);
  });

  it('builds composable field patches without mutating the source record', async () => {
    const patch = await executeProcessDataNode(
      { kind: 'record.fieldChange', typeId: 'project', path: 'identity.name' },
      { value: createDataPacket('Cutting room') }
    );
    const source = { identity: { name: 'Old' } };
    const result = applyPatch(source, patch.branches[0].items[0]);
    expect(result.identity.name).toBe('Cutting room');
    expect(source.identity.name).toBe('Old');
  });

  it('uses typed in-node defaults when a value socket is not connected', async () => {
    const result = await executeProcessDataNode(
      { kind: 'value.math', operation: 'add', inputDefaults: { right: 30 } },
      { left: createDataPacket(12) }
    );
    expect(result.branches[0].items).toEqual([42]);
  });

  it('uses one logic node for gates and comparisons', async () => {
    const comparison = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'gte' },
      { left: createDataPacket(30), right: createDataPacket(20) }
    );
    const gate = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'and' },
      { left: createDataPacket(true), right: createDataPacket(false) }
    );
    expect(comparison.branches[0].items).toEqual([true]);
    expect(gate.branches[0].items).toEqual([false]);
  });

  it('adds calendar offsets to entity timestamps and compares dates', async () => {
    const shifted = await executeProcessDataNode(
      { kind: 'value.dateTime', operation: 'addDays', inputDefaults: { amount: 30 } },
      { date: createDataPacket('2026-01-01T10:00:00.000Z') }
    );
    const difference = await executeProcessDataNode(
      { kind: 'value.dateTime', operation: 'differenceDays' },
      { left: shifted, right: createDataPacket('2026-01-01T10:00:00.000Z') }
    );
    expect(shifted.branches[0].items).toEqual(['2026-01-31T10:00:00.000Z']);
    expect(difference.branches[0].items).toEqual([30]);
  });

  it('supports unary math, complete gates, and structured text edits', async () => {
    const sqrt = await executeProcessDataNode(
      { kind: 'value.math', operation: 'sqrt' },
      { value: createDataPacket(81) }
    );
    const nand = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'nand' },
      { left: createDataPacket(true), right: createDataPacket(true) }
    );
    const trim = await executeProcessDataNode(
      { kind: 'value.string', operation: 'trim' },
      { value: createDataPacket('  CutKit  ') }
    );
    const substring = await executeProcessDataNode(
      { kind: 'value.string', operation: 'substring' },
      { text: createDataPacket('process'), start: createDataPacket(1), end: createDataPacket(4) }
    );

    expect(sqrt.branches[0].items).toEqual([9]);
    expect(nand.branches[0].items).toEqual([false]);
    expect(trim.branches[0].items).toEqual(['CutKit']);
    expect(substring.branches[0].items).toEqual(['roc']);
  });

  it('returns the requested typed block from entity deconstruction', async () => {
    const result = await executeProcessDataNode(
      {
        id: 'deconstruct',
        kind: 'record.deconstruct',
        blocks: ['identity', 'states']
      },
      { entity: createDataPacket({ identity: { name: 'Queue' }, states: { main: null, timestamp: '2026-01-01T00:00:00.000Z' } }) },
      { outputId: 'states' }
    );

    expect(result.branches[0].items).toEqual([{ main: null, timestamp: '2026-01-01T00:00:00.000Z' }]);
  });

  it('composes and modifies typed blocks without entity field paths leaking into their values', async () => {
    const composed = await executeProcessDataNode(
      { kind: 'record.composeBlock', block: 'identity', fields: ['identity.name', 'identity.slug'] },
      {
        'identity.name': createDataPacket('Queue'),
        'identity.slug': createDataPacket('queue')
      }
    );
    const modified = await executeProcessDataNode(
      { kind: 'record.modifyBlock', block: 'identity', fields: ['identity.name'] },
      {
        block: composed,
        'identity.name': createDataPacket('Cut queue')
      }
    );

    expect(composed.branches[0].items).toEqual([{ name: 'Queue', slug: 'queue' }]);
    expect(modified.branches[0].items).toEqual([{ name: 'Cut queue', slug: 'queue' }]);
  });

  it('emits one composed block per aligned tuple from list-shaped inputs', async () => {
    const composed = await executeProcessDataNode(
      { kind: 'record.composeBlock', block: 'identity', fields: ['identity.name', 'identity.slug'] },
      {
        'identity.name': createDataPacket(['Queue', 'Archive'], 'list'),
        'identity.slug': createDataPacket(['queue', 'archive'], 'list')
      }
    );

    expect(composed.branches).toEqual([{ path: [], items: [
      { name: 'Queue', slug: 'queue' },
      { name: 'Archive', slug: 'archive' }
    ] }]);
  });

  it('emits one composed open-entry block per aligned tuple from list-shaped inputs', async () => {
    const composed = await executeProcessDataNode(
      {
        kind: 'record.composeBlock',
        block: 'relations',
        compositionMode: 'relations',
        entries: [{ id: 'library', key: 'library', typeId: 'library' }]
      },
      { 'entry:library': createDataPacket([{ type: 'library', id: 'a' }, { type: 'library', id: 'b' }], 'list') }
    );

    expect(composed.branches).toEqual([{ path: [], items: [
      { library: { type: 'library', id: 'a' } },
      { library: { type: 'library', id: 'b' } }
    ] }]);
  });

  it('writes explicit scalar or collected array values without relation cardinality metadata', async () => {
    const replace = await executeProcessDataNode({
      kind: 'record.modifyBlock',
      block: 'relations',
      compositionMode: 'relations',
      entries: [{ id: 'library', key: 'library', typeId: 'library' }]
    }, {
      block: createDataPacket({ library: { type: 'library', id: 'a' } }),
      'entry:library': createDataPacket({ type: 'library', id: 'b' })
    });
    expect(replace.branches[0].items).toEqual([{ library: { type: 'library', id: 'b' } }]);

    const collected = [{ type: 'library', id: 'a' }, { type: 'library', id: 'b' }];
    const many = await executeProcessDataNode({
      kind: 'record.composeBlock', block: 'relations', compositionMode: 'relations', entries: [{ id: 'libraries', key: 'libraries' }]
    }, { 'entry:libraries': createDataPacket(collected) });
    expect(many.branches[0].items).toEqual([{ libraries: collected }]);
  });

  it('packs packet lists into one array-valued block field and unpacks them explicitly', async () => {
    const refs = [{ type: 'queue', id: 'q1' }, { type: 'queue', id: 'q2' }];
    const packed = await executeProcessDataNode(
      { kind: 'collection.packArray' },
      { value: createDataPacket(refs, 'list') }
    );
    const unpacked = await executeProcessDataNode(
      { kind: 'collection.unpackArray' },
      { value: packed }
    );

    expect(packed.branches[0].items).toEqual([refs]);
    expect(unpacked.branches[0].items).toEqual(refs);
  });

  it('keeps the persisted-array boundary explicit for empty and non-array values', async () => {
    const packed = await executeProcessDataNode(
      { kind: 'collection.packArray' },
      { value: createDataPacket([], 'list') }
    );
    const unpacked = await executeProcessDataNode(
      { kind: 'collection.unpackArray' },
      { value: packed }
    );

    expect(packed.branches[0].items).toEqual([[]]);
    expect(unpacked.branches[0].items).toEqual([]);
    await expect(executeProcessDataNode(
      { kind: 'collection.unpackArray' },
      { value: createDataPacket('not-an-array') }
    )).rejects.toThrow('requires an array value');
  });

  it('joins lists with Concat in order while preserving branch topology', async () => {
    const flat = await executeProcessDataNode(
      { kind: 'collection.concat' },
      { left: createDataPacket([1, 2], 'list'), right: createDataPacket([3], 'list') }
    );
    expect(flat.branches).toEqual([{ path: [0], items: [1, 2, 3] }]);

    const branched = await executeProcessDataNode(
      { kind: 'collection.concat' },
      {
        left: createDataPacket({ branches: [
          { path: [0], items: ['a', 'b'] },
          { path: [1], items: ['c'] }
        ] }, 'tree'),
        right: createDataPacket({ branches: [
          { path: [0], items: ['x'] },
          { path: [1], items: ['y', 'z'] }
        ] }, 'tree')
      }
    );
    expect(branched.branches).toEqual([
      { path: [0, 0], items: ['a', 'b', 'x'] },
      { path: [1, 0], items: ['c', 'y', 'z'] }
    ]);

    const empty = await executeProcessDataNode(
      { kind: 'collection.concat' },
      { left: createDataPacket([], 'list'), right: createDataPacket([1], 'list') }
    );
    expect(empty.branches).toEqual([{ path: [0], items: [1] }]);
  });

  it('builds a list from the fixed Make List sockets in socket order, skipping unwired sockets', async () => {
    const result = await executeProcessDataNode(
      { kind: 'collection.makeList' },
      {
        item1: createDataPacket('first'),
        item3: createDataPacket('third'),
        item4: createDataPacket('fourth')
      }
    );

    expect(result.branches).toEqual([{ path: [0], items: ['first', 'third', 'fourth'] }]);
  });

  it('honours authored Make List fallbacks for unwired sockets', async () => {
    const result = await executeProcessDataNode(
      {
        kind: 'collection.makeList',
        inputDefaults: { item2: 'fallback' }
      },
      { item1: createDataPacket('wired') }
    );

    expect(result.branches).toEqual([{ path: [0], items: ['wired', 'fallback'] }]);
  });

  it('constructs an empty list from a fully unconnected Make List', async () => {
    const result = await executeProcessDataNode({ kind: 'collection.makeList' }, {});

    expect(result.branches).toEqual([{ path: [], items: [] }]);
  });

  it('constructs a relation array from independent typed references', async () => {
    const listed = await executeProcessDataNode(
      { kind: 'collection.makeList' },
      {
        item1: createDataPacket({ type: 'library', id: 'lib-1' }),
        item2: createDataPacket({ type: 'library', id: 'lib-2' })
      }
    );
    const packed = await executeProcessDataNode(
      { kind: 'collection.packArray' },
      { value: listed }
    );
    const composed = await executeProcessDataNode({
      kind: 'record.composeBlock',
      block: 'relations',
      compositionMode: 'relations',
      entries: [{ id: 'libraries', key: 'libraries' }]
    }, { 'entry:libraries': packed });

    const refs = [{ type: 'library', id: 'lib-1' }, { type: 'library', id: 'lib-2' }];
    expect(packed.branches[0].items).toEqual([refs]);
    expect(composed.branches[0].items).toEqual([{ libraries: refs }]);
  });

  it('constructs an attachment array from independent typed attachment references', async () => {
    const listed = await executeProcessDataNode(
      { kind: 'collection.makeList' },
      {
        item1: createDataPacket({ kind: 'drawing', id: 'att-1' }),
        item2: createDataPacket({ kind: 'drawing', id: 'att-2' })
      }
    );
    const packed = await executeProcessDataNode(
      { kind: 'collection.packArray' },
      { value: listed }
    );
    const composed = await executeProcessDataNode({
      kind: 'record.composeBlock',
      block: 'attachments',
      compositionMode: 'attachments',
      entries: [{ id: 'drawings', key: 'drawings', attachmentKind: 'drawing' }]
    }, { 'entry:drawings': packed });

    const attachments = [{ kind: 'drawing', id: 'att-1' }, { kind: 'drawing', id: 'att-2' }];
    expect(packed.branches[0].items).toEqual([attachments]);
    expect(composed.branches[0].items).toEqual([{ drawings: attachments }]);
  });

  it('constructs a command entity-list input array from independent entity references', async () => {
    const listed = await executeProcessDataNode(
      { kind: 'collection.makeList' },
      {
        item1: createDataPacket({ type: 'queue', id: 'q1' }),
        item2: createDataPacket({ type: 'queue', id: 'q2' }),
        item3: createDataPacket({ type: 'queue', id: 'q3' })
      }
    );
    const packed = await executeProcessDataNode(
      { kind: 'collection.packArray' },
      { value: listed }
    );

    expect(packed.branches[0].items).toEqual([
      [{ type: 'queue', id: 'q1' }, { type: 'queue', id: 'q2' }, { type: 'queue', id: 'q3' }]
    ]);
  });

  it('composes lineage keys from typed ancestor references', async () => {
    const composed = await executeProcessDataNode(
      {
        kind: 'record.composeBlock',
        block: 'lineage',
        compositionMode: 'ancestors',
        entries: [
          { id: 'organization', key: 'organizationId', typeId: 'organization' },
          { id: 'nesting-run', key: 'runId', typeId: 'nesting_run' }
        ]
      },
      {
        'entry:organization': createDataPacket({ type: 'organization', id: 'org-1' }),
        'entry:nesting-run': createDataPacket({ type: 'nesting_run', id: 'run-1' })
      }
    );
    expect(composed.branches[0].items).toEqual([{
      organizationId: 'org-1',
      runId: 'run-1'
    }]);
  });

  it('composes a socket-derived entity relation', async () => {
    const composed = await executeProcessDataNode({
      kind: 'record.composeBlock',
      block: 'relations',
      compositionMode: 'relations',
      entries: [{ id: 'library', key: 'library', typeId: 'library', cardinality: 'one' }]
    }, {
      'entry:library': createDataPacket({ type: 'library', id: 'library-1' })
    });
    expect(composed.branches[0].items).toEqual([{
      library: { type: 'library', id: 'library-1' }
    }]);
  });

  it('reads a lineage id back as the declared typed entity reference', async () => {
    const result = await executeProcessDataNode(
      {
        kind: 'record.getField',
        block: 'lineage',
        path: 'lineage.queueId',
        compositionMode: 'ancestors',
        type: { base: 'entityRef', shape: 'item', typeId: 'queue' }
      },
      { block: createDataPacket({ queueId: 'queue-1' }) }
    );
    expect(result.branches[0].items).toEqual([{ type: 'queue', id: 'queue-1' }]);
  });

  it('rejects Get Block and Deconstruct blocks outside the entity contract at runtime', async () => {
    const domain = { entities: [{ type: 'project', blocks: ['identity', 'states', 'attachments', 'data'] }] };
    const entity = createDataPacket({ identity: { name: 'One' } });

    await expect(executeProcessDataNode(
      { kind: 'record.getBlock', typeId: 'project', block: 'summary' },
      { entity },
      { domain }
    )).rejects.toThrow('uses block summary outside project');
    await expect(executeProcessDataNode(
      { kind: 'record.deconstruct', typeId: 'project', blocks: ['identity', 'relations'] },
      { entity },
      { domain }
    )).rejects.toThrow('uses block relations outside project');
  });

  it('reads the framework-owned attachments block through Get Block and Deconstruct', async () => {
    const domain = { entities: [{ type: 'project', blocks: ['identity', 'attachments', 'data'] }] };
    const attachments = [{ kind: 'drawing', id: 'att-1' }, { kind: 'drawing', id: 'att-2' }];
    const entity = createDataPacket({ identity: { name: 'One' }, attachments });

    const block = await executeProcessDataNode(
      { kind: 'record.getBlock', typeId: 'project', block: 'attachments' },
      { entity },
      { domain }
    );
    expect(block.branches[0].items).toEqual([attachments]);

    const deconstructed = await executeProcessDataNode(
      { kind: 'record.deconstruct', typeId: 'project', blocks: ['identity', 'attachments'] },
      { entity },
      { domain }
    );
    expect(deconstructed.branches[0].items).toEqual([{ identity: { name: 'One' }, attachments }]);
  });

  // Union of the CNC block family (identity, lineage, origin, status,
  // attachments, data, specs, summary plus auto-appended relations and
  // provenance) as declared by packages/domain-cnc/src/entities.js.
  const fullFamilyDomain = {
    entities: [{
      type: 'sheet',
      blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data', 'specs', 'summary', 'relations', 'provenance']
    }]
  };
  const fullFamilyEntity = (name, primary) => ({
    identity: { name },
    lineage: { projectId: 'project-1' },
    origin: { source: 'import' },
    states: { main: primary },
    attachments: { drawings: [{ kind: 'drawing', id: `att-${name}` }] },
    data: { note: `note-${name}` },
    specs: { thickness: 18 },
    summary: { queueCount: 2 },
    relations: { library: { type: 'library', id: 'lib-1' } },
    provenance: { producedBy: { type: 'nesting_run', id: 'run-1' } }
  });
  const fullFamilyBlocks = fullFamilyDomain.entities[0].blocks;

  it('preserves item, list, and tree topology reading the full CNC block family', async () => {
    const first = fullFamilyEntity('One', 'NEW');
    const second = fullFamilyEntity('Two', 'DONE');
    const third = fullFamilyEntity('Three', 'NEW');
    const deconstruct = { kind: 'record.deconstruct', typeId: 'sheet', blocks: fullFamilyBlocks };

    const item = await executeProcessDataNode(
      deconstruct,
      { entity: createDataPacket(first) },
      { domain: fullFamilyDomain }
    );
    expect(item.branches[0].items).toEqual([first]);

    const list = await executeProcessDataNode(
      deconstruct,
      { entity: createDataPacket([first, second], 'list') },
      { domain: fullFamilyDomain }
    );
    expect(list.branches).toEqual([{ path: [], items: [first, second] }]);

    const treeInput = createDataPacket({ branches: [
      { path: [2], items: [first, second] },
      { path: [7], items: [third] }
    ] }, 'tree');
    const tree = await executeProcessDataNode(
      deconstruct,
      { entity: treeInput },
      { domain: fullFamilyDomain }
    );
    expect(tree.branches).toEqual([
      { path: [2], items: [first, second] },
      { path: [7], items: [third] }
    ]);

    // Every declared family block — including the managed read-only
    // origin/status/provenance/summary blocks — is readable through Get Block
    // with the same topology.
    for (const block of fullFamilyBlocks) {
      const read = await executeProcessDataNode(
        { kind: 'record.getBlock', typeId: 'sheet', block },
        { entity: treeInput },
        { domain: fullFamilyDomain }
      );
      expect(read.branches).toEqual([
        { path: [2], items: [first[block], second[block]] },
        { path: [7], items: [third[block]] }
      ]);
    }

    // Get Field keeps the same topology over fixed and open blocks.
    const names = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.name' },
      { block: await executeProcessDataNode(
        { kind: 'record.getBlock', typeId: 'sheet', block: 'identity' },
        { entity: treeInput },
        { domain: fullFamilyDomain }
      ) }
    );
    expect(names.branches).toEqual([
      { path: [2], items: ['One', 'Two'] },
      { path: [7], items: ['Three'] }
    ]);

    // Deconstruct's per-block output feeds Get Field on managed blocks.
    const statusBlocks = await executeProcessDataNode(
      { id: 'deconstruct', ...deconstruct },
      { entity: treeInput },
      { domain: fullFamilyDomain, outputId: 'states' }
    );
    const statuses = await executeProcessDataNode(
      { kind: 'record.getField', block: 'states', path: 'states.main' },
      { block: statusBlocks }
    );
    expect(statuses.branches).toEqual([
      { path: [2], items: ['NEW', 'DONE'] },
      { path: [7], items: ['NEW'] }
    ]);
  });

  it('round-trips typed attachments through Compose, Deconstruct, Get Block, and Get Field', async () => {
    const listed = await executeProcessDataNode(
      { kind: 'collection.makeList' },
      {
        item1: createDataPacket({ kind: 'drawing', id: 'att-1' }),
        item2: createDataPacket({ kind: 'drawing', id: 'att-2' })
      }
    );
    const packed = await executeProcessDataNode(
      { kind: 'collection.packArray' },
      { value: listed }
    );
    const composed = await executeProcessDataNode({
      kind: 'record.composeBlock',
      block: 'attachments',
      compositionMode: 'attachments',
      entries: [{ id: 'drawings', key: 'drawings', attachmentKind: 'drawing' }]
    }, { 'entry:drawings': packed });

    const entityValue = {
      identity: { name: 'One' },
      attachments: composed.branches[0].items[0]
    };
    const entity = createDataPacket(entityValue);

    const deconstructed = await executeProcessDataNode(
      { id: 'deconstruct', kind: 'record.deconstruct', typeId: 'sheet', blocks: ['identity', 'attachments'] },
      { entity },
      { domain: fullFamilyDomain, outputId: 'attachments' }
    );
    const entryList = await executeProcessDataNode(
      { kind: 'record.getField', block: 'attachments', path: 'attachments.drawings' },
      { block: deconstructed }
    );
    expect(entryList.branches[0].items).toEqual([[{ kind: 'drawing', id: 'att-1' }, { kind: 'drawing', id: 'att-2' }]]);

    const block = await executeProcessDataNode(
      { kind: 'record.getBlock', typeId: 'sheet', block: 'attachments' },
      { entity },
      { domain: fullFamilyDomain }
    );
    const entry = await executeProcessDataNode(
      { kind: 'record.getField', block: 'attachments', path: 'attachments.drawings.1' },
      { block }
    );
    expect(entry.branches[0].items).toEqual([{ kind: 'drawing', id: 'att-2' }]);
  });

  it('composes typed named entries for open data blocks', async () => {
    const composed = await executeProcessDataNode(
      {
        kind: 'record.composeBlock',
        block: 'data',
        compositionMode: 'entries',
        entries: [
          { id: 'note', key: 'note', type: { base: 'string', shape: 'item' } },
          { id: 'quantity', key: 'metrics.quantity', type: { base: 'number', shape: 'item' } }
        ]
      },
      {
        'entry:note': createDataPacket('Ready'),
        'entry:quantity': createDataPacket(12)
      }
    );
    expect(composed.branches[0].items).toEqual([{ note: 'Ready', metrics: { quantity: 12 } }]);
  });

  it('finds entities by field through the full mask path', async () => {
    const entities = [
      { identity: { name: 'Alpha' } },
      { identity: { name: 'Beta' } },
      { identity: { name: 'Gamma' } }
    ];
    const selected = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const blocks = await executeProcessDataNode(
      { kind: 'record.getBlock', block: 'identity' },
      { entity: selected }
    );
    const names = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.name' },
      { block: blocks }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'eq' },
      { left: names, right: createDataPacket('Alpha') }
    );
    const found = await executeProcessDataNode(
      { kind: 'collection.filter' },
      { items: selected, mask }
    );
    expect(found.branches[0].items).toEqual([entities[0]]);
  });

  it('composes multiple Logic conditions without a second query language', async () => {
    const entities = [
      { identity: { name: 'Alpha' }, states: { main: 'NEW' } },
      { identity: { name: 'Alpha' }, states: { main: 'DONE' } },
      { identity: { name: 'Beta' }, states: { main: 'NEW' } }
    ];
    const selected = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const fieldMask = async (block, path, operation, target) => {
      const blocks = await executeProcessDataNode({ kind: 'record.getBlock', block }, { entity: selected });
      const values = await executeProcessDataNode({ kind: 'record.getField', block, path }, { block: blocks });
      return executeProcessDataNode({ kind: 'value.logic', operation }, { left: values, right: createDataPacket(target) });
    };
    const nameMask = await fieldMask('identity', 'identity.name', 'eq', 'Alpha');
    const statusMask = await fieldMask('states', 'states.main', 'eq', 'NEW');
    const combined = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'and' },
      { left: nameMask, right: statusMask }
    );
    const found = await executeProcessDataNode(
      { kind: 'collection.filter' },
      { items: selected, mask: combined }
    );
    expect(found.branches[0].items).toEqual([entities[0]]);
  });

  it('selects by status as a scalar primary status id', async () => {
    const entities = [
      { identity: { name: 'Alpha' }, states: { main: 'NEW' } },
      { identity: { name: 'Beta' }, states: { main: 'DONE' } },
      { identity: { name: 'Gamma' }, states: { main: 'DONE' } }
    ];
    const selected = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const blocks = await executeProcessDataNode(
      { kind: 'record.deconstruct', blocks: ['states'] },
      { entity: selected },
      { outputId: 'states' }
    );
    const statuses = await executeProcessDataNode(
      { kind: 'record.getField', block: 'states', path: 'states.main' },
      { block: blocks }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'eq' },
      { left: statuses, right: createDataPacket('DONE') }
    );
    const found = await executeProcessDataNode(
      { kind: 'collection.filter' },
      { items: selected, mask }
    );
    expect(found.branches[0].items).toEqual([entities[1], entities[2]]);
  });

  it('selects by typed entity-reference equality', async () => {
    const entities = [
      { relations: { library: { type: 'library', id: 'lib-a' } } },
      { relations: { library: { type: 'library', id: 'lib-b' } } }
    ];
    const selected = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const blocks = await executeProcessDataNode(
      { kind: 'record.getBlock', block: 'relations' },
      { entity: selected }
    );
    const refs = await executeProcessDataNode(
      { kind: 'record.getField', block: 'relations', path: 'relations.library' },
      { block: blocks }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'eq' },
      { left: refs, right: createDataPacket({ type: 'library', id: 'lib-a' }) }
    );
    const found = await executeProcessDataNode(
      { kind: 'collection.filter' },
      { items: selected, mask }
    );
    expect(found.branches[0].items).toEqual([entities[0]]);
  });

  it('returns an empty result when no entity matches the mask', async () => {
    const entities = [{ identity: { name: 'Alpha' } }];
    const selected = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const blocks = await executeProcessDataNode(
      { kind: 'record.getBlock', block: 'identity' },
      { entity: selected }
    );
    const names = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.name' },
      { block: blocks }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'eq' },
      { left: names, right: createDataPacket('Nobody') }
    );
    const found = await executeProcessDataNode(
      { kind: 'collection.filter' },
      { items: selected, mask }
    );
    expect(found.branches[0].items).toEqual([]);
  });

  it('finds only records the read source authorized', async () => {
    const all = [
      { identity: { name: 'Alpha' } },
      { identity: { name: 'Beta' } },
      { identity: { name: 'Gamma' } }
    ];
    const authorized = [all[0], all[2]];
    const selected = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'project' },
      {},
      { queryEntities: async () => authorized }
    );
    const blocks = await executeProcessDataNode(
      { kind: 'record.getBlock', block: 'identity' },
      { entity: selected }
    );
    const names = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.name' },
      { block: blocks }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'contains' },
      { left: names, right: createDataPacket('a') }
    );
    const found = await executeProcessDataNode(
      { kind: 'collection.filter' },
      { items: selected, mask }
    );
    expect(found.branches[0].items).toEqual([all[0], all[2]]);
  });

  it('rejects a Filter mask whose item count mismatches the items', async () => {
    const items = createDataPacket([{ id: 'a' }, { id: 'b' }], 'list');
    const mask = createDataPacket([true], 'list');
    await expect(executeProcessDataNode({ kind: 'collection.filter' }, { items, mask }))
      .rejects.toThrow('one mask entry per item');
  });

  it('rejects a Dispatch mask whose branches mismatch the item branches', async () => {
    const items = createDataPacket({ branches: [{ path: [0], items: [1, 2] }] }, 'tree');
    const mask = createDataPacket({
      branches: [{ path: [0], items: [true] }, { path: [1], items: [false] }]
    }, 'tree');
    await expect(executeProcessDataNode({ kind: 'collection.dispatch' }, { items, mask }))
      .rejects.toThrow('one mask branch per item branch');
  });

  it('dispatches items into matched branches using the aligned mask', async () => {
    const items = createDataPacket([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'list');
    const mask = createDataPacket([true, false, true], 'list');
    const kept = await executeProcessDataNode(
      { kind: 'collection.dispatch' },
      { items, mask },
      { outputId: 'true' }
    );
    expect(kept.branches[0].items).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('pins scalar enum and structural typed-reference equality', async () => {
    const enumEqual = await executeProcessDataNode(
      { kind: 'value.compare', operation: 'eq' },
      { left: createDataPacket('RED'), right: createDataPacket('RED') }
    );
    const refEqual = await executeProcessDataNode(
      { kind: 'value.compare', operation: 'eq' },
      { left: createDataPacket({ type: 'library', id: 'lib-a' }), right: createDataPacket({ type: 'library', id: 'lib-a' }) }
    );
    const refDifferent = await executeProcessDataNode(
      { kind: 'value.compare', operation: 'eq' },
      { left: createDataPacket({ type: 'library', id: 'lib-a' }), right: createDataPacket({ type: 'library', id: 'lib-b' }) }
    );
    expect(enumEqual.branches[0].items).toEqual([true]);
    expect(refEqual.branches[0].items).toEqual([true]);
    expect(refDifferent.branches[0].items).toEqual([false]);
  });

  it('sorts items by a strictly aligned key list in both directions', async () => {
    const items = createDataPacket(['beta', 'alpha', 'gamma'], 'list');
    const keys = createDataPacket([2, 1, 3], 'list');

    const ascending = await executeProcessDataNode(
      { kind: 'collection.sort', direction: 'asc' },
      { items, keys }
    );
    const descending = await executeProcessDataNode(
      { kind: 'collection.sort', direction: 'desc' },
      { items, keys }
    );

    expect(ascending.branches[0].items).toEqual(['alpha', 'beta', 'gamma']);
    expect(descending.branches[0].items).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('defaults sort to ascending and keeps equal keys stable with nulls last', async () => {
    const items = createDataPacket(['a', 'b', 'c', 'd'], 'list');
    const keys = createDataPacket([null, 2, 2, 1], 'list');

    const sorted = await executeProcessDataNode(
      { kind: 'collection.sort' },
      { items, keys }
    );

    expect(sorted.branches[0].items).toEqual(['d', 'b', 'c', 'a']);
  });

  it('rejects a Sort key list whose length mismatches the items', async () => {
    const items = createDataPacket(['a', 'b'], 'list');
    const keys = createDataPacket([1], 'list');
    await expect(executeProcessDataNode({ kind: 'collection.sort' }, { items, keys }))
      .rejects.toThrow('one mask entry per item');
  });

  it('sorts by a date field then slices the most recent ten', async () => {
    const entities = Array.from({ length: 12 }, (_, index) => ({
      identity: { name: `job-${index}` },
      data: { updatedAt: `2026-08-${String(11 - index).padStart(2, '0')}T00:00:00.000Z` }
    }));
    const selected = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'job' },
      {},
      { queryEntities: async () => entities }
    );
    const blocks = await executeProcessDataNode(
      { kind: 'record.getBlock', block: 'data' },
      { entity: selected }
    );
    const dates = await executeProcessDataNode(
      { kind: 'record.getField', block: 'data', path: 'data.updatedAt' },
      { block: blocks }
    );
    const sorted = await executeProcessDataNode(
      { kind: 'collection.sort', direction: 'desc' },
      { items: selected, keys: dates }
    );
    const windowed = await executeProcessDataNode(
      { kind: 'collection.slice' },
      { items: sorted, end: createDataPacket(10) }
    );

    expect(windowed.branches[0].items).toHaveLength(10);
    expect(windowed.branches[0].items.map(item => item.identity.name)).toEqual(
      Array.from({ length: 10 }, (_, index) => `job-${index}`)
    );
  });

  it('deduplicates entities by an aligned reference key without losing values', async () => {
    const entities = [
      { relations: { library: { type: 'library', id: 'lib-a' } } },
      { relations: { library: { type: 'library', id: 'lib-b' } } },
      { relations: { library: { type: 'library', id: 'lib-a' } } }
    ];
    const selected = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const blocks = await executeProcessDataNode(
      { kind: 'record.getBlock', block: 'relations' },
      { entity: selected }
    );
    const refs = await executeProcessDataNode(
      { kind: 'record.getField', block: 'relations', path: 'relations.library' },
      { block: blocks }
    );
    const unique = await executeProcessDataNode(
      { kind: 'collection.distinct' },
      { items: selected, keys: refs }
    );

    expect(unique.branches[0].items).toEqual([entities[0], entities[1]]);
  });

  it('deduplicates the items themselves when Distinct has no keys', async () => {
    const values = createDataPacket(['a', 'b', 'a', 'c', 'b'], 'list');
    const unique = await executeProcessDataNode(
      { kind: 'collection.distinct' },
      { items: values }
    );

    expect(unique.branches[0].items).toEqual(['a', 'b', 'c']);
  });

  it('groups entities by an aligned status key preserving source branch paths', async () => {
    const entities = [
      { states: { main: 'NEW' }, identity: { name: 'a' } },
      { states: { main: 'DONE' }, identity: { name: 'b' } },
      { states: { main: 'NEW' }, identity: { name: 'c' } }
    ];
    const selected = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const blocks = await executeProcessDataNode(
      { kind: 'record.getBlock', block: 'states' },
      { entity: selected }
    );
    const statuses = await executeProcessDataNode(
      { kind: 'record.getField', block: 'states', path: 'states.main' },
      { block: blocks }
    );
    const grouped = await executeProcessDataNode(
      { kind: 'collection.groupBy' },
      { items: selected, keys: statuses }
    );

    expect(grouped.branches.map(branch => branch.path)).toEqual([[0], [1]]);
    expect(grouped.branches[0].items.map(item => item.identity.name)).toEqual(['a', 'c']);
    expect(grouped.branches[1].items.map(item => item.identity.name)).toEqual(['b']);
  });

  it('rejects a Group By key list whose length mismatches the items', async () => {
    const items = createDataPacket(['a', 'b'], 'list');
    const keys = createDataPacket(['x'], 'list');
    await expect(executeProcessDataNode({ kind: 'collection.groupBy' }, { items, keys }))
      .rejects.toThrow('one mask entry per item');
  });

  it('resolves Item At with negative, out-of-range, empty, and absent indices', async () => {
    const items = createDataPacket([{ id: 'first' }, { id: 'middle' }, { id: 'last' }], 'list');

    const first = await executeProcessDataNode(
      { kind: 'collection.itemAt' },
      { items, index: createDataPacket(0) }
    );
    const last = await executeProcessDataNode(
      { kind: 'collection.itemAt' },
      { items, index: createDataPacket(-1) }
    );
    const outOfRange = await executeProcessDataNode(
      { kind: 'collection.itemAt' },
      { items, index: createDataPacket(5) }
    );
    const absent = await executeProcessDataNode(
      { kind: 'collection.itemAt' },
      { items }
    );
    const empty = await executeProcessDataNode(
      { kind: 'collection.itemAt' },
      { items: createDataPacket([], 'list'), index: createDataPacket(0) }
    );

    expect(first.branches[0].items).toEqual([{ id: 'first' }]);
    expect(last.branches[0].items).toEqual([{ id: 'last' }]);
    expect(outOfRange.branches[0].items).toEqual([null]);
    expect(absent.branches[0].items).toEqual([null]);
    expect(empty.branches[0].items).toEqual([null]);
  });

  it('slices with negative and empty-list semantics', async () => {
    const items = createDataPacket(['a', 'b', 'c'], 'list');

    const tail = await executeProcessDataNode(
      { kind: 'collection.slice' },
      { items, start: createDataPacket(-2) }
    );
    const empty = await executeProcessDataNode(
      { kind: 'collection.slice' },
      { items: createDataPacket([], 'list'), start: createDataPacket(0) }
    );

    expect(tail.branches[0].items).toEqual(['b', 'c']);
    expect(empty.branches[0].items).toEqual([]);
  });

  it('returns the first matching entity by composing Filter then Item At', async () => {
    const entities = [
      { identity: { name: 'Alpha' }, states: { main: 'NEW' } },
      { identity: { name: 'Beta' }, states: { main: 'DONE' } },
      { identity: { name: 'Gamma' }, states: { main: 'DONE' } }
    ];
    const selected = await executeProcessDataNode(
      { kind: 'read.queryEntities', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const blocks = await executeProcessDataNode(
      { kind: 'record.getBlock', block: 'states' },
      { entity: selected }
    );
    const statuses = await executeProcessDataNode(
      { kind: 'record.getField', block: 'states', path: 'states.main' },
      { block: blocks }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'eq' },
      { left: statuses, right: createDataPacket('DONE') }
    );
    const matching = await executeProcessDataNode(
      { kind: 'collection.filter' },
      { items: selected, mask }
    );
    const first = await executeProcessDataNode(
      { kind: 'collection.itemAt' },
      { items: matching, index: createDataPacket(0) }
    );

    expect(first.branches[0].items).toEqual([entities[1]]);
  });
});
