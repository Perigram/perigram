import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenSourceSync } from './useScreenSourceSync.js';
import {
  emitInstanceUpdated,
  INSTANCE_CHANGED_EVENT
} from '~/utils/instance-events.js';

describe('useScreenSourceSync', () => {
  beforeEach(() => {
    vi.stubGlobal('window', new EventTarget());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reloads once (debounced) for changes touching a source type', () => {
    const screen = () => ({ sources: [{ id: 'a', typeId: 'widget' }] });
    const reload = vi.fn();
    useScreenSourceSync(screen, reload);
    emitInstanceUpdated({ type: 'widget', id: 'w1' });
    emitInstanceUpdated({ type: 'widget', id: 'w2' });
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(80);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores changes for types the screen does not source', () => {
    const screen = () => ({ sources: [{ id: 'a', typeId: 'widget' }] });
    const reload = vi.fn();
    useScreenSourceSync(screen, reload);
    emitInstanceUpdated({ type: 'gadget', id: 'g1' });
    vi.advanceTimersByTime(120);
    expect(reload).not.toHaveBeenCalled();
  });

  it('matches kebab and snake type spellings', () => {
    const screen = () => ({ sources: [{ id: 'a', typeId: 't-part-1' }] });
    const reload = vi.fn();
    useScreenSourceSync(screen, reload);
    emitInstanceUpdated({ type: 't_part_1', id: 'p1' });
    vi.advanceTimersByTime(80);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores type-less events', () => {
    const reload = vi.fn();
    useScreenSourceSync(() => ({ sources: [{ id: 'a', typeId: 'widget' }] }), reload);
    window.dispatchEvent(new Event(INSTANCE_CHANGED_EVENT));
    vi.advanceTimersByTime(120);
    expect(reload).not.toHaveBeenCalled();
  });
});
