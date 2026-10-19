// The entity popup's openable guard: a popup renders for types with a
// real record surface (directory profile, compiled/synthesizable detail
// screen, or the record floor over the served type view). A type absent
// from the served view is refused — callers render plain text instead.
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const manifest = [
  { screenKey: 'orders', id: 'orders', typeId: 'order', template: 'typeList' },
  {
    screenKey: 'auto_cassette_detail',
    id: 'd1',
    typeId: 'cassette',
    template: 'instanceDetail',
    sources: [{ id: 's1', typeId: 'cassette', mode: 'single' }]
  }
];

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => ({ screenManifest: manifest })
}));

vi.mock('~/composables/useFileTypeView', () => ({
  useFileTypeView: () => ({
    typeById: (typeId) => (['text-document', 'entityRevision'].includes(typeId) ? { id: typeId } : null)
  })
}));

async function loadPopup() {
  const refs = {};
  vi.stubGlobal('useState', (key, init) => (key in refs ? refs[key] : (refs[key] = { value: init() })));
  const { useEntityPopup } = await import('./useEntityPopup.js');
  return useEntityPopup();
}

describe('useEntityPopup openable guard', () => {
  it('opens directory types and types with a compiled or synthesizable detail screen', async () => {
    const popup = await loadPopup();
    expect(popup.openable('user')).toBe(true);
    expect(popup.openable('organization')).toBe(true);
    expect(popup.openable('cassette')).toBe(true);
    // No compiled detail, but the type's list screen synthesizes one.
    expect(popup.openable('order')).toBe(true);
  });

  it('opens served types without a compiled screen on the record floor', async () => {
    const popup = await loadPopup();
    expect(popup.openable('text-document')).toBe(true);
  });

  it('refuses types absent from the served view', async () => {
    const popup = await loadPopup();
    expect(popup.openable('unknown-type')).toBe(false);
    expect(popup.openable('')).toBe(false);
    popup.open({ typeId: 'unknown-type', instanceId: 'x-1' });
    expect(popup.request.value).toBeNull();
  });

  it('opens openable types and stores string ids', async () => {
    const popup = await loadPopup();
    popup.open({ typeId: 'cassette', instanceId: 42 });
    expect(popup.request.value).toEqual({ typeId: 'cassette', instanceId: '42' });
    popup.close();
    expect(popup.request.value).toBeNull();
  });
});
