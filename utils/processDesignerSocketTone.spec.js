import { describe, expect, it } from 'vitest';
import {
  processSocketColor,
  processSocketHandleStyle,
  processSocketTone
} from './processDesignerSocketTone.js';

describe('process designer socket tones', () => {
  it('maps the canonical port contract to semantic signal roles', () => {
    expect(processSocketTone({ type: { base: 'entity' } })).toBe('reference');
    expect(processSocketTone({ type: { base: 'entityRef' } })).toBe('reference');
    expect(processSocketTone({ type: { base: 'block' } })).toBe('structure');
    expect(processSocketTone({ type: { base: 'number' } })).toBe('quantity');
    expect(processSocketTone({ type: { base: 'boolean' } })).toBe('decision');
    expect(processSocketTone({ type: { base: 'dateTime' } })).toBe('temporal');
    expect(processSocketTone({ type: { base: 'attachmentRef' } })).toBe('external');
    expect(processSocketTone({ type: { base: 'string' } })).toBe('data');
    expect(processSocketTone({ kind: 'entity' })).toBe('reference');
  });

  it('keeps control flow and projections distinct from ordinary data', () => {
    expect(processSocketTone({ role: 'event', type: { base: 'event' } })).toBe('effect');
    expect(processSocketTone({ kind: 'event' })).toBe('effect');
    expect(processSocketTone({ projection: true, kind: 'entity' })).toBe('projection');
  });

  it('derives handle and edge colors from the same token', () => {
    const port = { type: { base: 'entityRef' } };

    expect(processSocketColor(port)).toBe('var(--ck-signal-reference)');
    expect(processSocketHandleStyle(port)).toEqual({
      '--socket-color': 'var(--ck-signal-reference)'
    });
  });

  it('paints every socket as the same filled mark — no rings, no variants', () => {
    expect(processSocketHandleStyle({ role: 'event', type: { base: 'event' } })).toEqual({
      '--socket-color': 'var(--p-primary-color)'
    });
    expect(processSocketHandleStyle({ type: { base: 'status' }, wired: true })).toEqual(
      processSocketHandleStyle({ type: { base: 'status' } })
    );
  });
});
