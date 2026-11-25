import { describe, expect, it, vi } from 'vitest';
import { createDataPacket } from './data-tree.js';
import { executeProcessDataNode, executeProcessEffectNode } from './evaluator.js';
import { missingFieldMarker } from './missing-field.js';

describe('process v4 data execution', () => {
  it('casts a json object to a record and refuses a shape mismatch', async () => {
    const record = { kind: 'value.cast', outputType: { base: 'record' } };
    const cast = await executeProcessDataNode(record, { value: createDataPacket({ layouts: [] }) });
    expect(cast.branches[0].items[0]).toEqual({ layouts: [] });
    await expect(executeProcessDataNode(record, { value: createDataPacket([1, 2]) })).rejects.toThrow('cast to record requires an object');
  });

  it('itemizes a record field whose value is an array into one packet item per entry', async () => {
    const record = { kind: 'value.recordField', path: 'layouts' };
    const packet = await executeProcessDataNode(record, { value: createDataPacket({ layouts: [{ id: 0 }, { id: 1 }], summary: {} }) });
    expect(packet.branches[0].items).toEqual([{ id: 0 }, { id: 1 }]);
    const scalar = await executeProcessDataNode({ kind: 'value.recordField', path: 'summary' }, { value: createDataPacket({ summary: { placed: 2 } }) });
    expect(scalar.branches[0].items).toEqual([{ placed: 2 }]);
  });

  it('reads a record field by a wired key and prefers it over the authored path', async () => {
    const record = { kind: 'value.recordField', path: 'ignored', type: { base: 'json', nullable: true } };
    const packet = await executeProcessDataNode(record, {
      value: createDataPacket({ serial: 'S-1', name: 'Sheet' }),
      key: createDataPacket('serial')
    });
    expect(packet.branches[0].items).toEqual(['S-1']);
  });

  it('parses strings to numbers and dates through the string registry', async () => {
    const number = await executeProcessDataNode(
      { kind: 'value.string', operation: 'toNumber' },
      { value: createDataPacket('3.14') });
    expect(number.branches[0].items[0]).toBe(3.14);
    await expect(executeProcessDataNode(
      { kind: 'value.string', operation: 'toNumber' },
      { value: createDataPacket('nope') })).rejects.toThrow('Cannot parse "nope" as number');
    const date = await executeProcessDataNode(
      { kind: 'value.string', operation: 'toDateTime' },
      { value: createDataPacket('2026-10-27T10:00:00Z') });
    expect(date.branches[0].items[0]).toBe('2026-10-27T10:00:00.000Z');
  });

  it('selects one operand by a boolean condition, broadcasting a scalar condition over item lists', async () => {
    const record = { kind: 'value.select', type: { base: 'number', nullable: false } };
    const single = await executeProcessDataNode(record, {
      condition: createDataPacket(true),
      left: createDataPacket(1),
      right: createDataPacket(2)
    });
    expect(single.branches[0].items[0]).toBe(1);
    const list = await executeProcessDataNode(record, {
      condition: createDataPacket([false, true], 'list'),
      left: createDataPacket([10, 20], 'list'),
      right: createDataPacket([1, 2], 'list')
    });
    expect(list.branches[0].items).toEqual([1, 20]);
  });

  it('merges two records shallowly with the right side winning; a missing side merges as absent', async () => {
    const merged = await executeProcessDataNode(
      { kind: 'record.merge' },
      {
        left: createDataPacket({ a: 1, shared: 'left' }),
        right: createDataPacket({ b: 2, shared: 'right' })
      });
    expect(merged.branches[0].items[0]).toEqual({ a: 1, b: 2, shared: 'right' });
    const oneSided = await executeProcessDataNode(
      { kind: 'record.merge' },
      { left: createDataPacket({ a: 1 }), right: createDataPacket(missingFieldMarker('x')) });
    expect(oneSided.branches[0].items[0]).toEqual({ a: 1 });
  });

  it('emits the grouping key per branch beside the grouped items', async () => {
    const groups = await executeProcessDataNode(
      { kind: 'collection.groupBy' },
      {
        items: createDataPacket([{ n: 1 }, { n: 2 }, { n: 1 }], 'list'),
        keys: createDataPacket(['a', 'b', 'a'], 'list')
      });
    expect(groups.branches.map(branch => branch.items)).toEqual([[{ n: 1 }, { n: 1 }], [{ n: 2 }]]);
    const keys = await executeProcessDataNode(
      { kind: 'collection.groupBy' },
      {
        items: createDataPacket([{ n: 1 }, { n: 2 }, { n: 1 }], 'list'),
        keys: createDataPacket(['a', 'b', 'a'], 'list')
      }, { outputId: 'keys' });
    expect(keys.branches.map(branch => branch.items)).toEqual([['a'], ['b']]);
  });

  it('joins lists by authored keys, refusing unmatched keys in inner mode and keeping them null in left mode', async () => {
    const left = createDataPacket([{ type: 'A' }, { type: 'B' }], 'list');
    const right = createDataPacket([{ name: 'A', id: 'a-1' }], 'list');
    await expect(executeProcessDataNode(
      { kind: 'collection.join', leftKey: 'type', rightKey: 'name' },
      { left, right })).rejects.toThrow('unmatched left keys B');
    const joined = await executeProcessDataNode(
      { kind: 'collection.join', leftKey: 'type', rightKey: 'name', joinMode: 'left' },
      { left, right });
    expect(joined.branches[0].items).toEqual([
      { left: { type: 'A' }, right: { name: 'A', id: 'a-1' } },
      { left: { type: 'B' }, right: null }
    ]);
  });

  it('drops foreign-type items from a union entity stream feeding a typed extract', async () => {
    const record = { kind: 'cts.read', typeId: 'cassette-design', select: 'extract', projection: 'nesting-polygons' };
    const project = vi.fn(async (typeId, projectionId, value) => ({ polygons: value.id }));
    const packet = await executeProcessDataNode(record, {
      entity: createDataPacket([
        { type: 'cassette-design', id: 'd1' },
        { type: 'xlsx-workbook', id: 't1' },
        { type: 'cassette-design', id: 'd2' }
      ], 'list')
    }, { projectEntity: project });

    const items = packet.branches.flatMap(branch => branch.items);
    expect(items).toEqual([{ polygons: 'd1' }, { polygons: 'd2' }]);
    expect(project.mock.calls.map(call => call[2].id)).toEqual(['d1', 'd2']);
  });

  it.each(['cts.mutate', 'cts.transition', 'cts.remove'])(
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
      { kind: 'cts.mutate', typeId: 'project' },
      { entity, identity },
      invoke
    )).rejects.toThrow('items must be scalar or aligned');
    await expect(executeProcessEffectNode(
      { kind: 'cts.mutate', typeId: 'project', matching: 'cross' },
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
      { kind: 'cts.transition', typeId: 'project' },
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
      operation: 'cts.transition',
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
      { operation: 'cts.transition', branchPath: [], itemIndex: 0, entityRef: { type: 'project', id: 'p1' } },
      { operation: 'cts.transition', branchPath: [], itemIndex: 2, entityRef: { type: 'project', id: 'p3' } }
    ]);
  });

  it('carries a structured refusal\'s offenders onto the mutation failure (SPEC §24)', async () => {
    const invoke = vi.fn(async () => {
      throw Object.assign(new Error('logo: spot logo has no matching part'), {
        statusCode: 422,
        data: { failures: [{ name: 'logo', message: 'spot logo has no matching part' }] }
      });
    });
    const result = await executeProcessEffectNode(
      { kind: 'cts.construct', typeId: 'text-document', construction: { mode: 'fill' } },
      {},
      invoke
    );
    expect(result.failures[0].error).toMatchObject({
      statusCode: 422,
      message: 'logo: spot logo has no matching part',
      failures: [{ name: 'logo', message: 'spot logo has no matching part' }]
    });
  });

  it('names the missing value instead of invoking with it', async () => {
    // A Record field whose path matched nothing yields one marker per
    // item; the effect must refuse with the input id and the authored
    // path — never hand the marker to the handler.
    const invoke = vi.fn(async inputs => inputs);
    const result = await executeProcessEffectNode(
      { kind: 'cts.construct', typeId: 'text-document', construction: { mode: 'content' } },
      { content: createDataPacket([missingFieldMarker('A'), 'real text'], 'list') },
      invoke
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith({ content: 'real text' }, expect.objectContaining({ itemIndex: 1 }));
    expect(result.failures).toEqual([{
      operation: 'cts.construct',
      branchPath: [],
      itemIndex: 0,
      error: { name: 'Error', message: `cts.construct input 'content' received a missing value (nothing at path 'A')` }
    }]);
    expect(result.completedMutations).toHaveLength(1);
  });

  it('carries a single failed item in the failure-carrying output', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('write denied');
    });
    const result = await executeProcessEffectNode(
      { kind: 'cts.mutate', typeId: 'project' },
      { entity: createDataPacket({ type: 'project', id: 'p1' }) },
      invoke
    );

    expect(result.completedMutations).toEqual([]);
    expect(result.failures).toEqual([{
      operation: 'cts.mutate',
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

  it('resolves the run-context principal sources through the data environment', async () => {
    const actor = { _id: 'user-1', type: 'user', name: 'Ada', fields: { name: 'Ada', email: 'ada@perigram.dev' } };
    const org = { _id: 'org-1', type: 'organization', name: 'Perigram', fields: { name: 'Perigram', email: null } };
    const who = await executeProcessDataNode(
      { kind: 'source.currentUser' }, {},
      { currentUser: async () => actor, currentOrganization: async () => org });
    const which = await executeProcessDataNode(
      { kind: 'source.currentOrganization' }, {},
      { currentUser: async () => actor, currentOrganization: async () => org });

    expect(who.branches[0].items).toEqual([actor]);
    expect(which.branches[0].items).toEqual([org]);
  });

  it('broadcasts an item over aligned list values', async () => {
    const result = await executeProcessDataNode(
      { kind: 'value.math', operation: 'multiply' },
      { left: createDataPacket([2, 3], 'list'), right: createDataPacket(10) }
    );
    expect(result.branches[0].items).toEqual([20, 30]);
  });

  it('fills named template slots from a record, one render per aligned row', async () => {
    const result = await executeProcessDataNode(
      { kind: 'value.format', template: 'Budget for {Category}: {Budget}' },
      { record: createDataPacket([{ Category: 'Housing', Budget: 1800 }, { Category: 'Groceries', Budget: 600 }], 'list') }
    );
    expect(result.branches[0].items).toEqual([
      'Budget for Housing: 1800',
      'Budget for Groceries: 600'
    ]);
  });

  it('keeps the {value} token substituting from the value input beside record slots', async () => {
    const result = await executeProcessDataNode(
      { kind: 'value.format', template: '{Category} = {value}' },
      { value: createDataPacket('ok'), record: createDataPacket({ Category: 'Housing' }) }
    );
    expect(result.branches[0].items).toEqual(['Housing = ok']);
  });

  it('keeps unmatched placeholders and skips missing-field cells in format templates', async () => {
    const result = await executeProcessDataNode(
      { kind: 'value.format', template: '{Category} -> {Missing}' },
      { record: createDataPacket([{ Category: 'Housing', Missing: missingFieldMarker('Missing') }], 'list') }
    );
    expect(result.branches[0].items).toEqual(['Housing -> {Missing}']);
  });

  it('loads All unfiltered', async () => {
    const queryEntities = vi.fn().mockResolvedValue([{ id: 'wide' }, { id: 'narrow' }]);
    const result = await executeProcessDataNode(
      { kind: 'cts.read', select: 'all', typeId: 'sheet' },
      {},
      { queryEntities }
    );
    expect(queryEntities).toHaveBeenCalledWith('sheet');
    expect(result.branches[0].items).toEqual([{ id: 'wide' }, { id: 'narrow' }]);
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
      { kind: 'value.compare', operation: 'gte' },
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
      { value: createDataPacket('  Perigram  ') }
    );
    const substring = await executeProcessDataNode(
      { kind: 'value.string', operation: 'substring' },
      { text: createDataPacket('process'), start: createDataPacket(1), end: createDataPacket(4) }
    );

    expect(sqrt.branches[0].items).toEqual([9]);
    expect(nand.branches[0].items).toEqual([false]);
    expect(trim.branches[0].items).toEqual(['Perigram']);
    expect(substring.branches[0].items).toEqual(['roc']);
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

  it('finds entities by field through the full mask path', async () => {
    const entities = [
      { name: 'Alpha' },
      { name: 'Beta' },
      { name: 'Gamma' }
    ];
    const selected = await executeProcessDataNode(
      { kind: 'cts.read', select: 'all', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const names = await executeProcessDataNode(
      { kind: 'cts.field', path: 'name' },
      { entity: selected }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.compare', operation: 'eq' },
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
      { name: 'Alpha', state: 'NEW' },
      { name: 'Alpha', state: 'DONE' },
      { name: 'Beta', state: 'NEW' }
    ];
    const selected = await executeProcessDataNode(
      { kind: 'cts.read', select: 'all', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const fieldMask = async (path, operation, target) => executeProcessDataNode(
      { kind: 'cts.field', path: path },
      { entity: selected }
    ).then(values => executeProcessDataNode({ kind: 'value.compare', operation }, { left: values, right: createDataPacket(target) }));
    const nameMask = await fieldMask('name', 'eq', 'Alpha');
    const statusMask = await fieldMask('state', 'eq', 'NEW');
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
      { kind: 'cts.read', select: 'all', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const statuses = await executeProcessDataNode(
      { kind: 'cts.field', path: 'states.main' },
      { entity: selected }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.compare', operation: 'eq' },
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
      { kind: 'cts.read', select: 'all', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const refs = await executeProcessDataNode(
      { kind: 'cts.field', path: 'relations.library' },
      { entity: selected }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.compare', operation: 'eq' },
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
      { kind: 'cts.read', select: 'all', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const names = await executeProcessDataNode(
      { kind: 'cts.field', path: 'name' },
      { entity: selected }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.compare', operation: 'eq' },
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
      { name: 'Alpha' },
      { name: 'Beta' },
      { name: 'Gamma' }
    ];
    const authorized = [all[0], all[2]];
    const selected = await executeProcessDataNode(
      { kind: 'cts.read', select: 'all', typeId: 'project' },
      {},
      { queryEntities: async () => authorized }
    );
    const names = await executeProcessDataNode(
      { kind: 'cts.field', path: 'name' },
      { entity: selected }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.compare', operation: 'contains' },
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
      { kind: 'cts.read', select: 'all', typeId: 'job' },
      {},
      { queryEntities: async () => entities }
    );
    const dates = await executeProcessDataNode(
      { kind: 'cts.field', path: 'fields.updatedAt' },
      { entity: selected }
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
      { kind: 'cts.read', select: 'all', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const refs = await executeProcessDataNode(
      { kind: 'cts.field', path: 'relations.library' },
      { entity: selected }
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
      { kind: 'cts.read', select: 'all', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const statuses = await executeProcessDataNode(
      { kind: 'cts.field', path: 'states.main' },
      { entity: selected }
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
      { kind: 'cts.read', select: 'all', typeId: 'project' },
      {},
      { queryEntities: async () => entities }
    );
    const statuses = await executeProcessDataNode(
      { kind: 'cts.field', path: 'states.main' },
      { entity: selected }
    );
    const mask = await executeProcessDataNode(
      { kind: 'value.compare', operation: 'eq' },
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

describe('native structure species execution', () => {
  it('composes open entries into one block through cts.compose', async () => {
    const composed = await executeProcessDataNode(
      { id: 'compose', kind: 'cts.compose', block: 'data', compositionMode: 'entries', entries: [{ id: 'e1', key: 'name' }, { id: 'e2', key: 'count' }] },
      { 'entry:e1': createDataPacket('One'), 'entry:e2': createDataPacket(2) }
    );

    expect(composed).toEqual({ branches: [{ path: [], items: [{ name: 'One', count: 2 }] }] });
  });

  it('composes the empty block when cts.compose declares no entries', async () => {
    const composed = await executeProcessDataNode({ id: 'compose', kind: 'cts.compose', block: 'data' }, {});

    expect(composed).toEqual({ branches: [{ path: [], items: [{}] }] });
  });

  it('emits one composed block per aligned tuple from list-shaped cts.compose inputs', async () => {
    const composed = await executeProcessDataNode(
      {
        id: 'compose',
        kind: 'cts.compose',
        block: 'data',
        compositionMode: 'entries',
        entries: [{ id: 'name', key: 'name' }, { id: 'slug', key: 'slug' }]
      },
      {
        'entry:name': createDataPacket(['Queue', 'Archive'], 'list'),
        'entry:slug': createDataPacket(['queue', 'archive'], 'list')
      }
    );

    expect(composed.branches).toEqual([{ path: [], items: [
      { name: 'Queue', slug: 'queue' },
      { name: 'Archive', slug: 'archive' }
    ] }]);
  });

  it('projects every declared facet from the instance through cts.decompose', async () => {
    const entity = createDataPacket({ name: 'One', fields: { note: 'x' } });
    const facets = await executeProcessDataNode(
      { id: 'decompose', kind: 'cts.decompose', typeId: 'project' },
      { entity },
      {
        fieldSchemas: [
          { path: 'name', block: 'identity', type: { base: 'string' } },
          { path: 'fields.note', block: 'fields', type: { base: 'string' } }
        ]
      }
    );

    expect(facets).toEqual({ branches: [{ path: [], items: [{
      'name': 'One',
      'fields.note': 'x'
    }] }] });
  });

  it('returns the selected facet when cts.decompose is pulled from one output', async () => {
    const one = await executeProcessDataNode(
      { id: 'decompose', kind: 'cts.decompose', typeId: 'project' },
      { entity: createDataPacket({ name: 'One', fields: { note: 'x' } }) },
      {
        outputId: 'fields.note',
        fieldSchemas: [
          { path: 'name', block: 'identity', type: { base: 'string' } },
          { path: 'fields.note', block: 'fields', type: { base: 'string' } }
        ]
      }
    );

    expect(one).toEqual({ branches: [{ path: [], items: ['x'] }] });
  });

  it('reads a missing facet as the missing-field marker through cts.decompose', async () => {
    const one = await executeProcessDataNode(
      { id: 'decompose', kind: 'cts.decompose', typeId: 'project' },
      { entity: createDataPacket({ data: { note: 'x' } }) },
      {
        outputId: 'lineage.projectId',
        fieldSchemas: [{ path: 'lineage.projectId', block: 'lineage', type: { base: 'string' } }]
      }
    );

    expect(one.branches[0].items).toHaveLength(1);
    expect(one.branches[0].items[0]).toMatchObject({ $missingField: true, path: 'lineage.projectId' });
  });
});

describe('stable structural equality', () => {
  it('compares eq across differing key order', async () => {
    const result = await executeProcessDataNode(
      { kind: 'value.compare', operation: 'eq' },
      { left: createDataPacket({ a: 1, b: 2 }), right: createDataPacket({ b: 2, a: 1 }) }
    );

    expect(result.branches[0].items).toEqual([true]);
  });

  it('deduplicates key-order-differing duplicates without keys', async () => {
    const unique = await executeProcessDataNode(
      { kind: 'collection.distinct' },
      { items: createDataPacket([{ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 2 }], 'list') }
    );

    expect(unique.branches[0].items).toEqual([{ a: 1, b: 2 }]);
  });

  it('groups key-order-differing keys into one group', async () => {
    const grouped = await executeProcessDataNode(
      { kind: 'collection.groupBy' },
      {
        items: createDataPacket(['x', 'y'], 'list'),
        keys: createDataPacket([{ group: 1, n: 2 }, { n: 2, group: 1 }], 'list')
      }
    );

    expect(grouped.branches).toHaveLength(1);
    expect(grouped.branches[0].items).toEqual(['x', 'y']);
  });
});

describe('platform node species', () => {
  const serviceDomain = {
    serviceContracts: {
      'plugin.demo.echo': {
        signature: {
          input: { base: 'record', fields: { value: { base: 'string' } } },
          output: { base: 'string' }
        }
      }
    }
  };

  it('executes a pure value service as a data node', async () => {
    const valueService = vi.fn(async (operator, parameters) => {
      expect(operator).toBe('plugin.demo.echo');
      expect(parameters).toEqual({ value: 'hello' });
      return 'HELLO';
    });
    const packet = await executeProcessDataNode(
      { id: 'echo', kind: 'cts.valueService', operator: 'plugin.demo.echo' },
      { value: createDataPacket('hello') },
      { domain: serviceDomain, valueService }
    );
    expect(valueService).toHaveBeenCalledTimes(1);
    expect(packet.branches[0].items).toEqual(['HELLO']);
  });

  it('finds instances through declared filters', async () => {
    const queryEntities = vi.fn(async (typeId, filters) => {
      expect(typeId).toBe('panel');
      expect(filters).toEqual({ serial: 'P-1' });
      return [{ _id: 'panel-1', type: 'panel' }];
    });
    const packet = await executeProcessDataNode(
      { id: 'find', kind: 'cts.read', select: 'find', typeId: 'panel', filters: { 'fields.serial': 'P-1' } },
      {},
      { queryEntities }
    );
    expect(queryEntities).toHaveBeenCalledTimes(1);
    expect(packet.branches[0].items).toEqual([{ _id: 'panel-1', type: 'panel' }]);
  });
});
