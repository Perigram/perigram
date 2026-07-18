export function entityFromSelectOption(option) {
  if (isCanonicalEntity(option?.entity)) return option.entity;
  return isCanonicalEntity(option) ? option : null;
}

export function entityTypeFromSelectOption(option, entityType = '') {
  return entityType
    || option?.entityType
    || option?.entity?.entityType
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

export function entitySelectOptions(options = [], entityType = '') {
  return (Array.isArray(options) ? options : [])
    .map(option => ({
      option,
      entity: entityFromSelectOption(option),
      entityType: entityTypeFromSelectOption(option, entityType)
    }))
    .filter(item => item.entity && item.entityType);
}

function isCanonicalEntity(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.identity
    && (value._id !== undefined || value.identity?.uid)
  );
}

function selectValuesEqual(left, right) {
  if (left === right) return true;
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return String(left) === String(right);
}
