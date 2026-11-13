// Row-relative field references (SPEC §7/§20): guard paths and state
// field-policy ids address the bare row id; block-prefixed persisted
// spellings heal one-way at resolution and the canvas round trip.
import { describe, expect, it } from 'vitest';
import { normalizeRowRelativeFieldRefs, normalizeRowRelativeGuard, resolveCtsDefinition, rowRelativeFieldId } from './graph-protocol.js';

const prefixedGuard = {
  op: 'and',
  args: [
    { op: 'gt', args: [{ op: 'field', path: ['value', 'fields', 'total'] }, { op: 'lit', value: 10 }] },
    { op: 'eq', args: [{ op: 'field', path: ['value', 'data', 'stage'] }, { op: 'lit', value: 'qa' }] }
  ]
};

const healedGuard = {
  op: 'and',
  args: [
    { op: 'gt', args: [{ op: 'field', path: ['value', 'total'] }, { op: 'lit', value: 10 }] },
    { op: 'eq', args: [{ op: 'field', path: ['value', 'stage'] }, { op: 'lit', value: 'qa' }] }
  ]
};

describe('rowRelativeFieldId', () => {
  it('strips the row block prefix', () => {
    expect(rowRelativeFieldId('fields.total')).toBe('total');
    expect(rowRelativeFieldId('specs.width')).toBe('width');
    expect(rowRelativeFieldId('data.job.items')).toBe('job.items');
    expect(rowRelativeFieldId('total')).toBe('total');
    expect(rowRelativeFieldId('relations.owner')).toBe('relations.owner');
  });
});

describe('normalizeRowRelativeGuard', () => {
  it('heals block-prefixed paths inside boolean algebra', () => {
    expect(normalizeRowRelativeGuard(prefixedGuard)).toEqual(healedGuard);
  });

  it('keeps a clean guard by reference and leaves non-row roots alone', () => {
    const clean = { op: 'eq', args: [{ op: 'field', path: ['value', 'total'] }, { op: 'lit', value: 1 }] };
    expect(normalizeRowRelativeGuard(clean)).toBe(clean);
    const stateScoped = { op: 'eq', args: [{ op: 'field', path: ['value', 'state'] }, { op: 'lit', value: 'qa' }] };
    expect(normalizeRowRelativeGuard(stateScoped)).toEqual(stateScoped);
  });
});

describe('normalizeRowRelativeFieldRefs', () => {
  it('heals transition guards and operation-carried field-policy lists', () => {
    const data = {
      processNodes: {
        t1: { id: 't1', kind: 'cts.transition', typeId: 'panel', guard: prefixedGuard },
        t2: { id: 't2', kind: 'cts.transition', typeId: 'panel', state: { to: 'qa' }, fieldPolicy: { visible: ['fields.total', 'width'], editable: ['fields.total'] } },
        c1: { id: 'c1', kind: 'cts.construct', typeId: 'panel', inputDefaults: { state: 'qa' }, fieldPolicy: { visible: ['specs.note'] } },
        plain: { id: 'c2', kind: 'cts.construct', typeId: 'panel' }
      }
    };
    const healed = normalizeRowRelativeFieldRefs(data);
    expect(healed.processNodes.t1.guard).toEqual(healedGuard);
    expect(healed.processNodes.t2.fieldPolicy).toEqual({ visible: ['total', 'width'], editable: ['total'] });
    expect(healed.processNodes.c1.fieldPolicy).toEqual({ visible: ['note'] });
    expect(healed.processNodes.plain).toBe(data.processNodes.plain);
    expect(normalizeRowRelativeFieldRefs(healed)).toEqual(healed);
  });

  it('rides definition resolution', () => {
    const { definition: resolved } = resolveCtsDefinition({
      data: {
        graphProtocol: 5,
        processNodes: {
          t1: { id: 't1', kind: 'cts.transition', typeId: 'panel', state: { to: 'qa' }, guard: prefixedGuard, fieldPolicy: { visible: ['fields.total'] } }
        }
      }
    }, { entities: [{ type: 'panel' }], fieldSchemas: {} });
    expect(resolved.data.processNodes.t1.guard).toEqual(healedGuard);
    expect(resolved.data.processNodes.t1.fieldPolicy).toEqual({ visible: ['total'] });
  });
});
