import { describe, expect, it } from 'vitest';
import { processDesignerPaletteTiers } from './processDesignerPaletteTiers.js';

describe('process designer palette provenance tiers', () => {
  const groups = [
    { id: 'graph-invocation', source: 'graphs', items: [{ id: 'use-graph' }] },
    { id: 'documents', source: 'plugin', items: [{ id: 'plugin.documents.compose' }] },
    { id: 'values', source: 'framework', items: [{ id: 'value.string' }] },
    { id: 'empty-plugin', source: 'plugin', items: [] }
  ];

  it('keeps reusable graphs separate from platform and plugin operations', () => {
    expect(processDesignerPaletteTiers(groups, {
      graphs: 'Graphs', plugins: 'Plugins', framework: 'Platform'
    })).toEqual([
      { id: 'graphs', label: 'Graphs', groups: [groups[0]] },
      { id: 'pack', label: 'Plugins', groups: [groups[1]] },
      { id: 'framework', label: 'Platform', groups: [groups[2]] }
    ]);
  });

  it('omits empty tiers and groups without changing source group identity', () => {
    expect(processDesignerPaletteTiers([groups[0]], { graphs: 'Graphs' })).toEqual([
      { id: 'graphs', label: 'Graphs', groups: [groups[0]] }
    ]);
  });
});
