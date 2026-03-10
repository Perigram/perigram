/**
 * Entity field display schemas for DataBlock.
 * Each entry: { path, i18n, suffix?, prefix? }
 * - path: dot-notation path into the entity object (e.g. 'stroke.color')
 * - i18n: translation key for the label
 * - suffix: appended to value string (e.g. ' mm')
 * - prefix: prepended to value string
 */

export const PEN_TEMPLATE_FIELDS = [
    { path: 'stroke.color',   i18n: 'penTemplate.color' },
    { path: 'stroke.weight',  i18n: 'penTemplate.weight',  suffix: ' px' },
    { path: 'stroke.pattern', i18n: 'penTemplate.pattern' }
];

export const TOOL_PROFILE_FIELDS = [
    { path: 'diameter', i18n: 'toolProfile.diameter', suffix: ' mm' },
    { path: 'angle',    i18n: 'toolProfile.angle',    suffix: '°' },
    { path: 'kerf',     i18n: 'toolProfile.kerf',     suffix: ' mm' }
];

export const WAREHOUSE_FIELDS = [
    { path: 'type',          i18n: 'warehouse.type' },
    { path: 'address',       i18n: 'warehouse.address' },
    { path: 'contactPerson', i18n: 'warehouse.contactPerson' }
];

export const MATERIAL_PILE_FIELDS = [
    { path: 'data.stock.total', i18n: 'piles.stockTotal' },
    { path: 'data.stock.used',  i18n: 'piles.stockUsed' }
];
