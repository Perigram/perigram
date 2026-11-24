import { describe, expect, it } from 'vitest';
import { formatProcessType, normalizeProcessSocket, processType, processTypesCompatible, sanitizeProcessType } from './types.js';

describe('process v4 type algebra', () => {
  it('gates json sockets by their declared value kind (SPEC §28 value contracts)', () => {
    const flow = processType('json', { kind: 'text.flow-document' });
    const report = processType('json', { kind: 'document.report' });
    const any = processType('json');

    expect(processTypesCompatible(flow, flow)).toMatchObject({ ok: true, implicit: true });
    expect(processTypesCompatible(flow, any)).toMatchObject({ ok: true, implicit: true });
    expect(processTypesCompatible(processType('string'), any)).toMatchObject({ ok: true, coercion: 'toJson' });
    expect(processTypesCompatible(any, flow).ok).toBe(false);
    expect(processTypesCompatible(processType('string'), flow).ok).toBe(false);
    expect(processTypesCompatible(flow, report).ok).toBe(false);
    expect(processTypesCompatible(flow, report).reason).toContain('text.flow-document');

    const flows = processType('array', { itemType: flow });
    expect(processTypesCompatible(processType('array', { itemType: flow }), flows).ok).toBe(true);
    expect(processTypesCompatible(processType('array', { itemType: report }), flows).ok).toBe(false);
    expect(formatProcessType(report)).toBe('json<document.report>');
  });

  it('keeps kind a json qualifier alone', () => {
    expect(sanitizeProcessType({ base: 'json', kind: 'document.report' }).kind).toBe('document.report');
    expect(sanitizeProcessType({ base: 'string', kind: 'document.report' }).kind).toBeUndefined();
    expect(() => processType('string', { kind: 'document.report' })).toThrow(/cannot carry kind/);
  });

  it('sanitizes stale qualifiers from stored process types', () => {
    const stale = sanitizeProcessType({ base: 'json', shape: 'item', nullable: false, typeId: 'queue' });
    expect(stale.typeId).toBeUndefined();
    expect(stale.base).toBe('json');
    const entity = sanitizeProcessType({ base: 'entity', typeId: 'queue' });
    expect(entity.typeId).toBe('queue');
    const block = sanitizeProcessType({ base: 'block', block: 'identity' });
    expect(block.block).toBe('identity');
    expect(sanitizeProcessType({ base: 'json', block: 'identity' }).block).toBeUndefined();
  });

  it('keeps element type independent from tree access', () => {
    const type = processType('entity', { typeId: 'queue', nullable: true, shape: 'tree' });
    expect(type).toEqual({ base: 'entity', nullable: true, typeId: 'queue' });
    expect(formatProcessType(type)).toBe('entity<queue>?');
    expect(normalizeProcessSocket({ id: 'entities', type, access: 'list' })).toMatchObject({ access: 'list', type });
  });

  it('clones JSON socket defaults out of the source object', () => {
    const point = new Proxy({ x: 0, y: 0, z: 0 }, {});
    const socket = normalizeProcessSocket({ id: 'at', type: processType('json'), default: point });
    expect(socket.default).toEqual({ x: 0, y: 0, z: 0 });
    expect(socket.default).not.toBe(point);
  });

  it('checks values without treating topology as compatibility', () => {
    expect(processTypesCompatible(processType('number'), processType('number'))).toMatchObject({ ok: true, implicit: true });
    expect(processTypesCompatible(processType('integer'), processType('number'))).toMatchObject({ ok: true, coercion: 'integerToNumber' });
    expect(processTypesCompatible(processType('entity', { typeId: 'project' }), processType('entity', { typeId: 'queue' })).ok).toBe(false);
  });

  it('coerces entity and entityRef implicitly within one type scope (the wire law that absorbed value.toEntityRef)', () => {
    // An instance is an instance (SPEC §20): both directions connect under
    // the same type-scope rule, so a read's entity output wires straight
    // into a ref socket with no conversion node.
    expect(processTypesCompatible(processType('entity', { typeId: 'queue' }), processType('entityRef', { typeId: 'queue' })))
      .toMatchObject({ ok: true, implicit: true, coercion: 'entityToReference' });
    expect(processTypesCompatible(processType('entityRef', { typeId: 'queue' }), processType('entity', { typeId: 'queue' })))
      .toMatchObject({ ok: true, implicit: true, coercion: 'entityToReference' });
    expect(processTypesCompatible(processType('entityRef', { typeId: 'queue' }), processType('entityRef', { typeId: 'queue' })))
      .toMatchObject({ ok: true, implicit: true });
    // The type scope is the gate: cross-type coercion refuses with the
    // expected/received diagnostic, never silently degrades.
    const cross = processTypesCompatible(processType('entity', { typeId: 'project' }), processType('entityRef', { typeId: 'queue' }));
    expect(cross.ok).toBe(false);
    expect(cross.reason).toContain('entityRef<queue>');
    expect(cross.reason).toContain('entity<project>');
    // Untyped references accept any instance scope.
    expect(processTypesCompatible(processType('entity', { typeId: 'project' }), processType('entityRef')).ok).toBe(true);
  });

  it('keeps array values separate from data-tree branches', () => {
    const array = processType('array', { itemType: processType('entityRef', { typeId: 'queue' }) });
    expect(array).toMatchObject({ base: 'array', itemType: { base: 'entityRef' } });
    expect(processTypesCompatible(array, processType('array', { itemType: processType('entityRef', { typeId: 'project' }) })).ok).toBe(false);
  });

  it('keeps unit changes explicit and names the units either way', () => {
    const mm = processType('number', { unit: 'mm' });
    const m = processType('number', { unit: 'm' });
    const deg = processType('number', { unit: 'deg' });

    expect(processTypesCompatible(mm, mm)).toMatchObject({ ok: true, implicit: true });
    const converted = processTypesCompatible(mm, m);
    expect(converted.ok).toBe(false);
    expect(converted.convertible).toBe(true);
    expect(converted.conversion).toMatchObject({
      nodeKind: 'value.convertUnit',
      sourceType: { base: 'number', unit: 'mm' },
      targetType: { base: 'number', unit: 'm' }
    });
    expect(converted.reason).toContain('mm');
    expect(converted.reason).toContain('m');

    const noConversion = processTypesCompatible(mm, deg);
    expect(noConversion.ok).toBe(false);
    expect(noConversion.convertible).toBe(false);
    expect(noConversion.reason).toContain('mm');
    expect(noConversion.reason).toContain('deg');
  });

  it('wraps a single value into the array its socket carries', () => {
    const entity = processType('entityRef', { typeId: 'queue' });
    const array = processType('array', { itemType: processType('entityRef', { typeId: 'queue' }) });
    expect(processTypesCompatible(entity, array)).toMatchObject({ ok: true, coercion: 'wrapsArray' });
    const otherArray = processType('array', { itemType: processType('entityRef', { typeId: 'project' }) });
    expect(processTypesCompatible(entity, otherArray).ok).toBe(false);
  });
});
