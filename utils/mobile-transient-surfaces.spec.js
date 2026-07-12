import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT,
  isMobileViewport,
  requestCloseMobileTransientSurfaces,
  requestCloseTransientSurfaces
} from './mobile-transient-surfaces.js';

describe('mobile transient surface helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dispatches the close event only on mobile viewports', () => {
    const events = [];
    const windowTarget = new EventTarget();
    windowTarget.matchMedia = vi.fn(() => ({ matches: true }));
    windowTarget.addEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, event => events.push(event.type));
    vi.stubGlobal('window', windowTarget);

    expect(isMobileViewport()).toBe(true);
    expect(requestCloseMobileTransientSurfaces()).toBe(true);
    expect(events).toEqual([MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT]);

    windowTarget.matchMedia = vi.fn(() => ({ matches: false }));
    expect(requestCloseMobileTransientSurfaces()).toBe(false);
    expect(events).toEqual([MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT]);
  });

  it('can request a close regardless of viewport', () => {
    const events = [];
    const windowTarget = new EventTarget();
    windowTarget.matchMedia = vi.fn(() => ({ matches: false }));
    windowTarget.addEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, event => events.push(event.type));
    vi.stubGlobal('window', windowTarget);

    expect(requestCloseTransientSurfaces()).toBe(true);
    expect(events).toEqual([MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT]);
  });
});
