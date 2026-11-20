import { describe, expect, it } from 'vitest';
import { pluginPaletteGroups, servicesPaletteGroups } from './designer.js';

// The plugin-tab law: one palette item per pack operation — never
// per-type copies. The type binds at configure time; the inspector's
// projection switch is the single mode selector.
describe('pluginPaletteGroups', () => {
  const projections = {
    'csv-table/rows': { typeId: 'csv-table', id: 'rows', label: 'Table rows', palette: { group: 'table-data' }, pluginId: 'documents' },
    'xlsx-workbook/rows': { typeId: 'xlsx-workbook', id: 'rows', label: 'Table rows', palette: { group: 'table-data' }, pluginId: 'documents' },
    'csv-table/cells': { typeId: 'csv-table', id: 'cells', label: 'Table cells (positional)', palette: { group: 'table-data' }, pluginId: 'documents' },
    'xlsx-workbook/cells': { typeId: 'xlsx-workbook', id: 'cells', label: 'Table cells (positional)', palette: { group: 'table-data' }, pluginId: 'documents' },
    'text-document/text': { typeId: 'text-document', id: 'text', label: 'Text', palette: { group: 'table-data' }, pluginId: 'documents' },
    'cassette/polygons': { typeId: 'cassette', id: 'polygons', label: 'Polygons', palette: { group: 'facade' }, pluginId: 'facade' },
    'un grouped': { typeId: 'misc', id: 'ungrouped', label: 'Ungrouped' }
  };

  it('emits one item per operation across types, projection pre-bound, type unbound', () => {
    const groups = pluginPaletteGroups(projections, {});
    expect(groups.every(group => group.source === 'plugin')).toBe(true);
    expect(groups.map(group => group.id)).toEqual(['plugin-documents', 'plugin-facade']);
    const tableData = groups[0].subgroups.find(subgroup => subgroup.id === 'table-data');
    expect(tableData.items.map(item => item.id)).toEqual(['extract:documents:rows', 'extract:documents:cells', 'extract:documents:text']);
    for (const item of tableData.items) {
      expect(item.preset.typeId).toBeUndefined();
      expect(item.preset.select).toBe('extract');
    }
    expect(tableData.items[0].preset.projection).toBe('rows');
    expect(groups[1].subgroups.find(subgroup => subgroup.id === 'facade').items).toHaveLength(1);
  });
  it('keeps ungrouped plugin services on their plugin section root', () => {
    const groups = pluginPaletteGroups({}, {
      fill: { id: 'plugin.documents.fill', command: 'plugin.documents.fill', label: 'Fill' },
      export: { id: 'plugin.facade.export', command: 'plugin.facade.export', label: 'Export' }
    });
    expect(groups.map(group => group.id)).toEqual(['plugin-documents', 'plugin-facade']);
    expect(groups.flatMap(group => group.items).map(item => item.id)).toEqual(['service:documents:fill', 'service:facade:export']);
    expect(groups.every(group => group.subgroups === undefined)).toBe(true);
    expect(servicesPaletteGroups({
      fill: { id: 'plugin.documents.fill', command: 'plugin.documents.fill', label: 'Fill' }
    })).toEqual([]);
  });

  it('keeps identical group slugs isolated by provider', () => {
    const groups = pluginPaletteGroups({}, {
      first: { id: 'one', command: 'plugin.documents.one', palette: { group: 'operations' } },
      second: { id: 'one', command: 'plugin.facade.one', palette: { group: 'operations' } }
    });
    expect(groups.map(group => group.id)).toEqual(['plugin-documents', 'plugin-facade']);
    expect(groups.map(group => group.items[0].id)).toEqual(['service:documents:one', 'service:facade:one']);
    expect(groups.map(group => group.subgroups[0].label)).toEqual(['Operations', 'Operations']);
  });

  it('uses provider-authored operation labels and descriptions in the palette', () => {
    const groups = pluginPaletteGroups({}, {
      'nesting-solve': {
        id: 'nesting-solve',
        command: 'nesting-solve', pluginId: 'facade',
        palette: { group: 'nesting', keywords: ['cutting', 'stock layout'] },
        label: 'Solve sheet nesting',
        description: 'Arrange parts on sheet stock',
        render: { label: 'Legacy fallback label', description: 'Legacy fallback description' }
      }
    });
    expect(groups[0].items[0]).toMatchObject({
      label: 'Solve sheet nesting',
      description: 'Arrange parts on sheet stock'
    });
  });

});
