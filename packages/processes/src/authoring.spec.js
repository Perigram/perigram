// The headless authoring seam's completeness guard: every palette item
// must drop, sync, configure, and survive the canvas double round-trip
// without a browser. A palette item that cannot be authored through the
// seam is a defect by contract (packages/processes README, "Headless
// definition authoring").
import { describe, expect, it } from 'vitest';
import {
  createDefinitionAuthoring
} from './authoring.js';
import { validateRoundTrip } from './transpiler.js';
import { createTypeRegistry, projectDomainFromView, frameworkTypes } from '../../cts/src/index.js';
import { cncTypePack } from '../../cts/src/pack/cnc.js';
import { facadeDomain, facadeServices } from '@perigram/facade';

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'authoring-spec' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    registry.defineType(declaration);
  }
  return projectDomainFromView(registry, 'org-1', facadeDomain, {
    packServices: facadeServices
  });
}

function authoring() {
  return createDefinitionAuthoring(projectedDomain());
}

function allPaletteItems(context) {
  return context.contract.paletteGroups.flatMap(group => group.items).filter(item => item.kind);
}

describe('headless definition authoring', () => {
  it('drops every palette item into a synced record with resolved ports', () => {
    const context = authoring();
    const items = allPaletteItems(context);
    expect(items.length).toBeGreaterThan(20);
    for (const item of items) {
      context.drop(item.id, { id: `drop-${item.id}` });
    }
    for (const item of items) {
      const record = context.record(`drop-${item.id}`);
      expect(record, `dropped ${item.id}`).toBeTruthy();
      expect(record.kind).toBe(item.kind);
      expect(record.inputs.length + record.outputs.length, `${item.id} resolves ports`).toBeGreaterThan(0);
    }
  });

  it('authors the loop as a pair — the closer lands with its loop', () => {
    const context = authoring();
    const [loop, closer] = context.drop('forEachEntity', { id: 'loop' });
    expect(loop.kind).toBe('control.forEach');
    expect(closer.kind).toBe('control.forEachEnd');
    expect(context.record('loopEnd')).toBe(closer);
  });

  it('preserves the record elimination key through the sync pass', () => {
    const context = authoring();
    context.drop('recordField', { id: 'rowName' });
    const record = context.configure('rowName', { path: 'name', type: { base: 'string', nullable: true } });
    expect(record.path).toBe('name');
    context.sync('rowName');
    expect(context.record('rowName').path).toBe('name');
  });

  it('configures join keys and record composer fields', () => {
    const context = authoring();
    context.drop('joinByKey', { id: 'join' });
    expect(context.configure('join', { leftKey: 'cassette', rightKey: 'identity.name' }).leftKey).toBe('cassette');
    context.drop('constructRecord', { id: 'params' });
    expect(context.configure('params', { fields: ['A', 'B'] }).fields).toEqual(['A', 'B']);
  });

  it('stores a socket fallback as one broadcast item packet', () => {
    const context = authoring();
    context.drop('itemAtPosition', { id: 'first' });
    const record = context.setInputDefault('first', 'index', 0);
    expect(record.inputDefaults.index).toEqual({ branches: [{ path: [], items: [0] }] });
  });

  it('rejects incompatible wires and single-socket double wires at the gate', () => {
    const context = authoring();
    context.drop('literal', { id: 'text' });
    context.drop('itemAtPosition', { id: 'first' });
    // string literal into the integer index socket is incompatible
    expect(() => context.connect('text', 'value', 'first', 'index')).toThrow(/Incompatible/);
    context.configure('text', { type: { base: 'integer', nullable: false }, value: 0 });
    const edge = context.connect('text', 'value', 'first', 'index');
    expect(edge.sourceHandle).toBe('data:value');
    expect(edge.targetHandle).toBe('data:index');
    expect(() => context.connect('text', 'value', 'first', 'index')).not.toThrow();
    const other = context.drop('literal', { id: 'other' });
    context.configure('other', { type: { base: 'integer', nullable: false }, value: 1 });
    expect(() => context.connect('other', 'value', 'first', 'index')).toThrow(/accepts one wire/);
  });

  it('round-trips every dropped palette record through the canvas twice', () => {
    const context = authoring();
    for (const item of allPaletteItems(context)) {
      context.drop(item.id, { id: `drop-${item.id}` });
    }
    const definition = context.definition();
    const { errors, warnings } = validateRoundTrip(definition);
    expect(errors, errors.join('; ')).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
