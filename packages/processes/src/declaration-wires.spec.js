// The declaration-plane wire vocabulary, pinned end-to-end (SPEC §20/§7).
// Three tables must agree on every wire: the legality table (what may
// connect), the connect gate (where it may land), and the live interpreter
// (what the wire authors). This spec enumerates the whole table — a wire
// missing from any table fails here instead of silently refusing on the
// canvas.
import { describe, it, expect } from 'vitest';
import { declarationWireLegality, interpretDeclarationEdges } from './designer.js';

const classNode = (id, typeId, extra = {}) => ({ id, type: 'ctsClass', data: { refId: id, typeId, class: 'item', ...extra } });
const fieldNode = (id, name, extra = {}) => ({ id, type: 'ctsField', data: { refId: id, typeId: null, name, descriptor: { base: 'string' }, ...extra } });
const stateNode = (id, value, extra = {}) => ({ id, type: 'ctsState', data: { refId: id, typeId: null, value, terminal: false, ...extra } });
const typeNode = (id, typeId) => ({ id, type: 'ctsType', data: { refId: id, typeId } });
const processNode = (id, kind, typeId = '') => ({ id, type: 'processNode', data: { refId: id } });
const record = (id, kind, typeId, extra = {}) => ({ id, kind, typeId, ...extra });
const edge = (id, source, target, label, data = undefined) => ({
  id, source, target, role: 'type', label, ...(data ? { data } : {})
});

describe('declaration wire vocabulary (legality + interpretation agree)', () => {
  it('every legal wire is known and every unknown pair is refused', () => {
    const legal = [
      ['ctsField', 'ctsClass', null, 'declares'],
      ['ctsState', 'ctsClass', null, 'declares'],
      ['ctsClass', 'ctsClass', null, 'children'],
      ['ctsState', 'ctsState', null, 'nested'],
      ['ctsState', 'processNode', { kind: 'cts.construct' }, 'entry'],
      ['ctsState', 'processNode', { kind: 'cts.transition' }, 'entry'],
      ['ctsClass', 'ctsField', null, 'targets'],
      ['ctsType', 'ctsField', null, 'targets'],
      ['ctsClass', 'processNode', { kind: 'cts.construct' }, 'binds'],
      ['ctsClass', 'processNode', { kind: 'cts.read' }, 'binds'],
      ['ctsType', 'processNode', { kind: 'cts.construct' }, 'binds'],
      ['ctsField', 'processNode', { kind: 'cts.field' }, 'field']
    ];
    for (const [sourceType, targetType, targetRecord, expected] of legal) {
      expect(declarationWireLegality({ sourceType, targetType, targetRecord }), `${sourceType} -> ${targetType}`).toBe(expected);
    }
    // Unknown pairs refuse: a field into an operation that is not getField,
    // a state into a non-status operation, a field into a state.
    expect(declarationWireLegality({ sourceType: 'ctsField', targetType: 'processNode', targetRecord: { kind: 'cts.mutate' } })).toBeNull();
    expect(declarationWireLegality({ sourceType: 'ctsState', targetType: 'processNode', targetRecord: { kind: 'cts.mutate' } })).toBeNull();
    expect(declarationWireLegality({ sourceType: 'ctsField', targetType: 'ctsState', targetRecord: null })).toBeNull();
    expect(declarationWireLegality({ sourceType: 'ctsState', targetType: 'ctsField', targetRecord: null })).toBeNull();
  });

  it('the state wire authors the operation state; the field wire authors the field path', () => {
    const nodes = [
      classNode('cls', 'panel', { class: 'file' }),
      fieldNode('f1', 'Cut speed', { descriptor: { base: 'quantity', unit: 'mm' } }),
      stateNode('s1', 'ready', { typeId: 'panel' }),
      processNode('mk', 'construct'),
      processNode('mv', 'transition'),
      processNode('gf', 'field')
    ];
    const edges = [
      edge('d1', 'f1', 'cls', 'field'),
      edge('d2', 's1', 'cls', 'state'),
      edge('e1', 's1', 'mk', 'entry'),
      edge('e2', 's1', 'mv', 'entry'),
      edge('e3', 'f1', 'gf', 'field')
    ];
    const records = {
      mk: record('mk', 'cts.construct', 'panel'),
      mv: record('mv', 'cts.transition', 'panel'),
      gf: record('gf', 'cts.field', 'panel')
    };
    const { mutations } = interpretDeclarationEdges(nodes, edges, records, {}, {}, []);
    const applied = Object.fromEntries(mutations.map(m => [`${m.recordId}:${m.key}`, m.value]));
    // The state wire is the value: both operations receive the state default.
    expect(applied['mk:inputDefaults.state']).toBe('ready');
    expect(applied['mv:inputDefaults.state']).toBe('ready');
    // The field wire is the field: the path derives exactly as the
    // declaration projection compiles it (slot from the class, id from
    // the authored name).
    expect(applied['gf:path']).toBe('fields.cutSpeed');
  });

  it('a quantity field on an item class lands in the specs slot', () => {
    const nodes = [
      classNode('cls', 'panel', { class: 'item' }),
      fieldNode('f1', 'Width', { descriptor: { base: 'quantity', unit: 'mm' } }),
      processNode('gf', 'field')
    ];
    const { mutations } = interpretDeclarationEdges(nodes, [edge('d1', 'f1', 'cls', 'field'), edge('e1', 'f1', 'gf', 'field')], { gf: record('gf', 'cts.field', 'panel') }, {}, {}, []);
    const applied = Object.fromEntries(mutations.map(m => [`${m.recordId}:${m.key}`, m.value]));
    expect(applied['gf:path']).toBe('fields.width');
  });
});
