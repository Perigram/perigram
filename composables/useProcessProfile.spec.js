import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useProcessProfile } from './useProcessProfile.js';

function createSession() {
  return useProcessProfile({
    t: key => key,
    te: () => true,
    toast: { add: () => {} },
    draft: ref(null),
    roles: () => ({}),
    activeOrganizationId: () => null,
    persistence: {}
  });
}

describe('useProcessProfile', () => {
  // GraphCanvas declares the connect handlers as required Function props —
  // a session export that misses its source composable breaks the
  // wire-drop palette on every host.
  it('exports the canvas connect handlers as functions', () => {
    const session = createSession();
    expect(typeof session.beginSocketConnection).toBe('function');
    expect(typeof session.endSocketConnection).toBe('function');
  });

  it('exposes canonical graph migration seams without replacing process-domain persistence', () => {
    const session = createSession();
    expect(typeof session.serializeCanonicalGraph).toBe('function');
    expect(typeof session.loadCanonicalGraph).toBe('function');
  });

  it('exports the preview and palette seams every host mounts', () => {
    const session = createSession();
    expect(typeof session.serializeProcess).toBe('function');
    expect(typeof session.loadDocument).toBe('function');
    expect(typeof session.onConnect).toBe('function');
    expect(typeof session.addContextNode).toBe('function');
    expect(Array.isArray(session.paletteGroups.value)).toBe(true);
    expect(Array.isArray(session.contextPaletteGroups.value)).toBe(true);
  });
});
