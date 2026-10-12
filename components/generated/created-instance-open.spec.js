import { describe, expect, it } from 'vitest';
import { resolveCreatedInstanceOpen, landCreatedInstanceInPool } from './created-instance-open.js';

const manifestWithDetail = [
  { template: 'instanceDetail', screenKey: 'cassette_detail', sources: [{ typeId: 'cassette', mode: 'single' }] }
];

describe('created-entity open target', () => {
  it('prefers the compiled detail route when the manifest has one', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'cassette', construction: { mode: 'editor' } },
      result: { entity: { _id: 'c-1', name: 'Tray' } },
      screenKey: 'home',
      manifest: manifestWithDetail
    });
    expect(target.kind).toBe('route');
    expect(target.instanceId).toBe('c-1');
  });

  it('opens the workspace for editor-protocol creates without a route', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'cassette', construction: { mode: 'editor' } },
      result: { entity: { _id: 'c-2', name: 'Blank tray' } },
      screenKey: 'home',
      manifest: []
    });
    expect(target).toMatchObject({ kind: 'workspace', typeId: 'cassette', instanceId: 'c-2', name: 'Blank tray', editor: true });
  });

  it('flags editor-protocol creates in the home workspace too (SPEC §UI: the editor opens)', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'text-document', construction: { mode: 'editor' } },
      result: { entity: { _id: 't-1', name: 'Notes' } },
      manifest: [{ template: 'home', route: '/home' }]
    });
    expect(target).toMatchObject({ kind: 'workspace', typeId: 'text-document', instanceId: 't-1', editor: true });
  });

  it('keeps non-editor creates unflagged in the home workspace', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'image', construction: { mode: 'upload' } },
      result: { entity: { _id: 'i-2', name: 'Shot' } },
      manifest: [{ template: 'home', route: '/home' }]
    });
    expect(target).toMatchObject({ kind: 'workspace', instanceId: 'i-2' });
    expect(target.editor).toBeUndefined();
  });

  it('reads the protocol from the v5 via binding too', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'sketch', via: 'editor' },
      result: { entity: { id: 's-1', name: 'Notes' } },
      manifest: []
    });
    expect(target.kind).toBe('workspace');
    expect(target.typeId).toBe('sketch');
    expect(target.editor).toBe(true);
  });

  it('falls back to a toast for non-editor creates without a route', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'image', construction: { mode: 'upload' } },
      result: { entity: { _id: 'i-1', name: 'Shot' } },
      manifest: []
    });
    expect(target).toMatchObject({ kind: 'toast', typeId: 'image', name: 'Shot' });
  });

  it('stays silent-proof: no result or no identifier resolves to null', () => {
    expect(resolveCreatedInstanceOpen({ action: { typeId: 'cassette' }, result: null })).toBeNull();
    expect(resolveCreatedInstanceOpen({ action: { typeId: 'cassette' }, result: { entity: {} } })).toBeNull();
  });

  it('unwraps single-item mapped mutation results', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'cassette', construction: { mode: 'editor' } },
      result: { result: { branches: [{ items: [{ entity: { _id: 'c-3', name: 'Mapped' } }] }] } },
      manifest: []
    });
    expect(target).toMatchObject({ kind: 'workspace', instanceId: 'c-3', name: 'Mapped' });
  });

  it('prefers the created entity of the action\'s own type in chained-construct runs', () => {
    // A process chaining further constructs after the action's own: the
    // run result carries every created entity, and the LAST step must
    // never bind a foreign record to the action's destination.
    const action = { typeId: 'cassette', construction: { mode: 'editor' } };
    const result = { result: { branches: [
      { items: [{ entity: { _id: 'c-chain', type: 'cassette', name: 'Tray' } }] },
      { items: [{ entity: { _id: 'i-other', type: 'e2e-item', name: 'Side effect' } }] }
    ] } };
    expect(resolveCreatedInstanceOpen({ action, result, manifest: [] }))
      .toMatchObject({ kind: 'workspace', typeId: 'cassette', instanceId: 'c-chain' });
  });
});

describe('created-entity pool landing', () => {
  function recordingStore() {
    const calls = [];
    return {
      calls,
      canonicalTypeKey: typeId => String(typeId || '').replace(/_/g, '-'),
      upsertRecord(typeKey, dto) {
        calls.push([typeKey, dto]);
        return { dto };
      }
    };
  }

  it('lands the created entity under its own type before the destination opens', () => {
    const store = recordingStore();
    const entity = { _id: 'c-9', type: 'e2e-folder', name: 'Probe', fields: {} };
    const landed = landCreatedInstanceInPool(store, { typeId: 'e2e-folder' }, { created: entity });
    expect(landed).toBeTruthy();
    expect(store.calls).toEqual([['e2e-folder', entity]]);
  });

  it('keys entities without a type by the action target (relation target first)', () => {
    const store = recordingStore();
    landCreatedInstanceInPool(store,
      { typeId: 'cassette', relationMutation: { targetTypes: ['sheet'] } },
      { entity: { _id: 'x-1', name: 'Shot' } });
    expect(store.calls).toEqual([['sheet', { _id: 'x-1', name: 'Shot' }]]);
  });

  it('stays a no-op without a store, a created entity, or an id', () => {
    expect(landCreatedInstanceInPool(null, { typeId: 'cassette' }, { entity: { _id: 'c-1' } })).toBeNull();
    const store = recordingStore();
    expect(landCreatedInstanceInPool(store, { typeId: 'cassette' }, null)).toBeNull();
    expect(landCreatedInstanceInPool(store, { typeId: 'cassette' }, { entity: {} })).toBeNull();
    expect(landCreatedInstanceInPool(store, {}, { entity: { _id: 'c-1' } })).toBeNull();
    expect(store.calls).toEqual([]);
  });
});
