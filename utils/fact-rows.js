// The one fact-row derivation for read-only record surfaces (peeks,
// tiles, compact refs, cards, directory profiles) — the generated
// plane's field vocabulary (`resolveFieldGroups` over the served type
// record: every declared field, sections as grouping) with the record's
// values, the value display policy, and the field-access gate. Contract
// home: components/shared/README.md → FactRows.
import {
  resolveFieldGroups,
  SCALAR_BASES,
  isLongText,
  isIdentifierField,
  fieldLabel,
  fieldLabelKey,
  localizedLabel
} from '#shared/ui-mapping/index.js';
import { decorateDataValue } from './data-display.js';
import { filterEntityFields } from '#shared/instance-field-access.js';

/**
 * Scalar fact rows for a record. `translator` is any `{ t, te, locale }`
 * pair; labels resolve the generated keys first with the resolver-derived
 * label as fallback, the same law detail surfaces read, `locale` drives
 * date formatting. `auth` is the field-access gate input
 * (`{ permissions, fieldPolicies, stateFieldPolicies }`); `cap` bounds
 * the row count, `skip` names fields that stay off display surfaces.
 */
export function instanceFactRows({
  typeId = '',
  typeRecord = null,
  entity = null,
  accessEntity = null,
  auth = null,
  translator = null,
  cap = null,
  skip = null
} = {}) {
  if (!typeRecord || !entity) return [];
  const skipped = new Set(skip || []);
  const rows = [];
  for (const group of resolveFieldGroups(typeRecord)) {
    for (const field of group.fields) {
      if (skipped.has(field.name)) continue;
      // The identifier is the identity slot — the surface's title owns
      // it; ref fields render through relation surfaces, prose and
      // structures through the detail body.
      if (isIdentifierField(typeRecord, field.name)) continue;
      if (field.descriptor?.base === 'ref') continue;
      if (!SCALAR_BASES.includes(field.descriptor?.base)) continue;
      if (isLongText(field.descriptor)) continue;
      const value = entity.fields?.[field.name];
      if (value === null || value === undefined || value === '') continue;
      const gateShape = { path: `fields.${field.name}`, label: field.label, base: field.descriptor.base, ...(field.descriptor.display ? { display: field.descriptor.display } : {}) };
      if (auth && !filterEntityFields({
        fields: [gateShape],
        auth,
        entity: accessEntity || entity,
        typeId
      }).length) continue;
      rows.push({ gateShape, field, value, group: group.id });
    }
  }
  return rows
    .slice(0, Number.isFinite(cap) ? cap : undefined)
    .map(({ gateShape, field, value, group }) => {
      const display = decorateDataValue(value, {
        ...gateShape,
        ...(field.descriptor.unit ? { unit: field.descriptor.unit } : {}),
        ...boolLabels(translator),
        locale: localeOf(translator)
      });
      if (!display) return null;
      const swatch = gateShape.display === 'swatch' && /^[0-9a-f]{3,8}$/i.test(String(value).replace('#', ''))
        ? `#${String(value).replace('#', '')}`
        : null;
      return {
        group,
        label: localizedLabel(translator, fieldLabelKey(typeId, field.name), field.label || fieldLabel(field.name, field.descriptor)),
        display,
        swatch,
        role: factRoleFor(field.descriptor)
      };
    })
    .filter(Boolean);
}

// Semantic value typography resolved from the field/display contract:
// measured values (number, quantity, instant) and code-shaped identifiers
// render the technical mono face; every other value renders the body face.
export function factRoleFor(descriptor = {}) {
  return ['number', 'quantity', 'instant'].includes(descriptor.base) || descriptor.display === 'code'
    ? 'technical'
    : 'body';
}

function localeOf(translator) {
  const locale = translator?.locale;
  return locale?.value ?? locale ?? undefined;
}

function boolLabels(translator) {
  const yes = translator?.te?.('common.yes') ? translator.t('common.yes') : null;
  const no = translator?.te?.('common.no') ? translator.t('common.no') : null;
  return { ...(yes ? { trueLabel: yes } : {}), ...(no ? { falseLabel: no } : {})};
}

