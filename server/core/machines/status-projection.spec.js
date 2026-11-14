import { describe, expect, it } from 'vitest';
import {
  persistableStatusMetadata,
  storedStateAxes,
  instanceStateSetFromStatus,
  statusPrimaryForRegion,
  mergeStatusDisplayMetadata,
  instanceStateView
} from './status-projection.js';

describe('workflow status projections', () => {
  it('keeps runtime-only producer and source metadata out of persisted metadata', () => {
    expect(persistableStatusMetadata({
      label: 'Ready', producerOutputId: 'runtime-output', source: 'worker'
    })).toEqual({ label: 'Ready' });
    expect(persistableStatusMetadata(null)).toEqual({});
  });

  it('filters evidence keys and non-string values from legacy state axes', () => {
    expect(storedStateAxes({
      main: 'ACTIVE', side: 'OPEN', userId: 'u1', timestamp: 'now',
      metadata: {}, eventId: 'event-1', lifecycle: {}, empty: '', count: 2
    })).toEqual({ main: 'ACTIVE', side: 'OPEN' });
  });

  it('projects primary state to the flat instance persistence shape', () => {
    expect(instanceStateSetFromStatus({ state: { primary: 'ACTIVE' } })).toMatchObject({
      state: 'ACTIVE'
    });
    expect(instanceStateSetFromStatus({ state: { primary: '' } })).toEqual({});
  });

  it('resolves primary state according to the workflow primary region', () => {
    expect(statusPrimaryForRegion({ primaryRegion: 'review', initial: 'DRAFT' }, 'review', 'APPROVED')).toBe('APPROVED');
    expect(statusPrimaryForRegion({ primaryRegion: 'main', initial: 'DRAFT' }, 'review', 'APPROVED')).toBe('DRAFT');
  });

  it('merges state display defaults without overriding authored metadata', () => {
    expect(mergeStatusDisplayMetadata(
      { display: { label: 'Custom label' } },
      { label: 'Default', severity: 'warning', icon: 'alert' }
    )).toEqual({
      display: { label: 'Custom label', color: 'warning', severity: 'warning', icon: 'alert' }
    });
    expect(mergeStatusDisplayMetadata({}, {})).toEqual({});
  });

  it('projects flat and legacy stored instance states into engine views', () => {
    const flat = { _id: 'a', state: 'ACTIVE' };
    expect(instanceStateView(flat)).toMatchObject({ states: { main: 'ACTIVE' } });
    const legacy = { _id: 'b', states: { main: 'OPEN', userId: 'u1' } };
    expect(instanceStateView(legacy)).toMatchObject({ states: { main: 'OPEN' } });
    expect(instanceStateView({ _id: 'c', status: { state: { primary: 'DONE' } } })).toMatchObject({ _id: 'c' });
  });
});
