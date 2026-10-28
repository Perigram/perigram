import { titleFor } from '#shared/ui-mapping/index.js';

export function instanceFromSelectOption(option) {
  if (isCanonicalEntity(option?.entity)) return option.entity;
  return isCanonicalEntity(option) ? option : null;
}

export function typeIdFromSelectOption(option, typeId = '') {
  return typeId
    || option?.typeId
    || option?.entity?.typeId
    || '';
}

export function selectOptionValue(option, optionValue = '') {
  if (typeof optionValue === 'function') return optionValue(option);
  if (!optionValue) return option;
  return String(optionValue).split('.').filter(Boolean)
    .reduce((value, key) => value?.[key], option);
}

export function selectOptionLabel(option, optionLabel = '') {
  if (typeof optionLabel === 'function') return optionLabel(option);
  const label = optionLabel
    ? String(optionLabel).split('.').filter(Boolean).reduce((value, key) => value?.[key], option)
    : option;
  if (label === null || label === undefined) return '';
  if (typeof label === 'object') return '';
  return String(label);
}

export function selectOptionForValue(options = [], value, optionValue = '') {
  return (Array.isArray(options) ? options : []).find(option =>
    selectValuesEqual(selectOptionValue(option, optionValue), value)
  ) || null;
}

export function instanceSelectOptions(options = [], typeId = '') {
  return (Array.isArray(options) ? options : [])
    .map(option => ({
      option,
      entity: instanceFromSelectOption(option),
      typeId: typeIdFromSelectOption(option, typeId)
    }))
    .filter(item => item.entity && item.typeId);
}

function isCanonicalEntity(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value._id !== undefined || value.id !== undefined)
    && (
      value.identity
      || (value.fields !== null && typeof value.fields === 'object')
    )
  );
}

// The instance-option derivation pickers share; see utils/README.md
// (SPEC §22.13).
export function instanceOptionLabel(instance, typeRecord = null, { typeLabel = '', unnamedLabel = '' } = {}) {
  const title = titleFor(instance, typeRecord, { unnamedLabel });
  return typeLabel ? `${typeLabel}: ${title}` : title;
}

export function instancePickerOptions(pool, accepts = [], {
  typeRecordFor = () => null,
  typeLabelFor = null,
  unnamedLabel = '',
  refValue = false
} = {}) {
  const types = (Array.isArray(accepts) ? accepts : []).filter(Boolean);
  const prefixed = types.length > 1 && typeof typeLabelFor === 'function';
  const options = [];
  for (const typeId of types) {
    for (const instance of Object.values(pool?.[typeId] || {})) {
      const id = String(instance?._id ?? instance?.id ?? '');
      if (!id) continue;
      options.push({
        label: instanceOptionLabel(instance, typeRecordFor(typeId), prefixed
          ? { typeLabel: typeLabelFor(typeId), unnamedLabel }
          : { unnamedLabel }),
        value: refValue ? { type: typeId, id } : id,
        entity: instance,
        typeId
      });
    }
  }
  return options;
}

function selectValuesEqual(left, right) {
  if (left === right) return true;
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return String(left) === String(right);
}
