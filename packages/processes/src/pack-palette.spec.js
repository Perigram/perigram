import { describe, expect, it } from 'vitest';
import { pluginPaletteGroups } from './designer.js';

// The plugin-tab law: one palette item per pack operation — never
// per-type copies. The type binds at configure time; the inspector's
// projection switch is the single mode selector.
describe('pluginPaletteGroups', () => {
  const projections = {
    'csv-table/rows': { typeId: 'csv-table', id: 'rows', label: 'Table rows', group: 'tableData' },
    'xlsx-workbook/rows': { typeId: 'xlsx-workbook', id: 'rows', label: 'Table rows', group: 'tableData' },
    'csv-table/cells': { typeId: 'csv-table', id: 'cells', label: 'Table cells (positional)', group: 'tableData' },
    'xlsx-workbook/cells': { typeId: 'xlsx-workbook', id: 'cells', label: 'Table cells (positional)', group: 'tableData' },
    'text-document/text': { typeId: 'text-document', id: 'text', label: 'Text', group: 'tableData' },
    'cassette/polygons': { typeId: 'cassette', id: 'polygons', label: 'Polygons', group: 'facade' },
    'un grouped': { typeId: 'misc', id: 'ungrouped', label: 'Ungrouped' }
  };

  it('emits one item per operation across types, projection pre-bound, type unbound', () => {
    const groups = pluginPaletteGroups(projections, {});
    expect(groups.every(group => group.source === 'plugin')).toBe(true);
    const tableData = groups.find(group => group.id === 'tableData');
    expect(tableData.items.map(item => item.id)).toEqual(['extract:rows', 'extract:cells', 'extract:text']);
    for (const item of tableData.items) {
      expect(item.preset.typeId).toBeUndefined();
      expect(item.preset.select).toBe('extract');
    }
    expect(tableData.items[0].preset.projection).toBe('rows');
    expect(groups.find(group => group.id === 'facade').items).toHaveLength(1);
  });
  it('uses provider-authored operation labels and descriptions in the palette', () => {
    const groups = pluginPaletteGroups({}, {
      'nesting-solve': {
        id: 'nesting-solve',
        command: 'nesting-solve',
        group: 'nesting',
        label: 'Solve sheet nesting',
        description: 'Arrange parts on sheet stock',
        keywords: ['cutting', 'stock layout'],
        render: { label: 'Legacy fallback label', description: 'Legacy fallback description' }
      }
    });
    expect(groups[0].items[0]).toMatchObject({
      label: 'Solve sheet nesting',
      description: 'Arrange parts on sheet stock'
    });
  });

});
