import { describe, expect, it } from 'vitest';
import { resolveCreatedInstanceOpen } from './created-instance-open.js';

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

  it('falls back to a toast for editor-protocol creates without a route or workspace', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'cassette', construction: { mode: 'editor' } },
      result: { entity: { _id: 'c-2', name: 'Blank tray' } },
      screenKey: 'home',
      manifest: []
    });
    expect(target).toMatchObject({ kind: 'toast', typeId: 'cassette', instanceId: 'c-2', name: 'Blank tray' });
  });

  it('opens the record surface in the home workspace (editor-bound types included)', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'text-document', construction: { mode: 'editor' } },
      result: { entity: { _id: 't-1', name: 'Notes' } },
      manifest: [{ template: 'home', route: '/home' }]
    });
    expect(target).toMatchObject({ kind: 'workspace', typeId: 'text-document', instanceId: 't-1' });
    expect(target.editor).toBeUndefined();
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
      manifest: [{ template: 'home', route: '/home' }]
    });
    expect(target.kind).toBe('workspace');
    expect(target.typeId).toBe('sketch');
    expect(target.editor).toBeUndefined();
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
      manifest: [{ template: 'home', route: '/home' }]
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
    expect(resolveCreatedInstanceOpen({ action, result, manifest: [{ template: 'home', route: '/home' }] }))
      .toMatchObject({ kind: 'workspace', typeId: 'cassette', instanceId: 'c-chain' });
  });
});
