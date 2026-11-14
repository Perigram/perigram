import { describe, expect, it } from 'vitest';
import { formatPreviewItem, formatPreviewItems, formatPreviewPath, graphOutputEntries } from './processDesignerChannelOutputs.js';

describe('processDesignerChannelOutputs', () => {
  it('formats paths, sampled items, and the missing-field tag', () => {
    expect(formatPreviewPath(['a', 'b'])).toBe('{a;b}');
    expect(formatPreviewPath()).toBe('{}');
    expect(formatPreviewItem({ missing: true, path: ['x', 'y'] })).toBe('missing(x.y)');
    expect(formatPreviewItem({ missing: true })).toBe('missing()');
    expect(formatPreviewItems([1, null])).toBe('1, null');
    expect(formatPreviewItems([])).toBe('');
  });

  it('derives one labeled entry per evaluated node', () => {
    const nodes = [
      {
        id: 'n1',
        data: {
          kindLabel: 'Compose report',
          groupLabel: 'Documents',
          outputSpecs: [{ id: 'report', label: 'Report', type: { base: 'json', kind: 'document.report' } }]
        }
      },
      { id: 'n2', data: { kindLabel: 'Hidden node' } }
    ];
    const payload = {
      nodes: {
        n1: { outputs: { report: { branchCount: 1, itemCount: 1, branches: [{ path: [], items: [{ title: 't' }] }], truncated: false } } },
        n2: { outputs: {}, error: 'boom' }
      }
    };
    const entries = graphOutputEntries(payload, nodes);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: 'n1', section: 'Documents', label: 'Compose report', error: '' });
    expect(entries[0].outputs[0]).toMatchObject({ id: 'report', label: 'Report' });
    expect(typeof entries[0].outputs[0].type).toBe('string');
    expect(entries[0].outputs[0].type).not.toBe('');
    expect(entries[1]).toMatchObject({ label: 'Hidden node', error: 'boom', outputs: [] });
  });

  it('falls back to ids when the canvas node or port is unknown', () => {
    const entries = graphOutputEntries({ nodes: { ghost: { outputs: { value: { branches: [] } } } } }, []);
    expect(entries[0]).toMatchObject({ id: 'ghost', label: 'ghost', section: '' });
    expect(entries[0].outputs[0].label).toBe('value');
    expect(entries[0].outputs[0].type).toBe('');
  });

  it('derives no entries from an empty evaluation', () => {
    expect(graphOutputEntries({}, [])).toEqual([]);
    expect(graphOutputEntries(null, [])).toEqual([]);
  });
});
