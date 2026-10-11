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

  it('opens the workspace for editor-protocol creates without a route', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'cassette', construction: { mode: 'editor' } },
      result: { entity: { _id: 'c-2', name: 'Blank tray' } },
      screenKey: 'home',
      manifest: []
    });
    expect(target).toMatchObject({ kind: 'workspace', typeId: 'cassette', instanceId: 'c-2', name: 'Blank tray' });
  });

  it('reads the protocol from the v5 via binding too', () => {
    const target = resolveCreatedInstanceOpen({
      action: { typeId: 'sketch', via: 'editor' },
      result: { entity: { id: 's-1', name: 'Notes' } },
      manifest: []
    });
    expect(target.kind).toBe('workspace');
    expect(target.typeId).toBe('sketch');
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
});
