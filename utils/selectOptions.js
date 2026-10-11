export function selectOptionText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
    if (value && typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
      const text = value.toString();
      if (text && text !== '[object Object]') return text;
    }
  }

  return '';
}

export function entitySelectLabel(entity, fallback = '') {
  return selectOptionText(
    entity?.name,
    entity?.label,
    entity?.title,
    entity?.name,
    entity?.identity?.slug,
    entity?.serial,
    entity?._id,
    entity?.slug,
    entity?.code,
    entity?._id,
    entity?.id,
    fallback
  );
}

export function entitySelectValue(entity, fallback = '') {
  return selectOptionText(
    entity?._id,
    entity?.id,
    entity?.value,
    entity?._id,
    fallback
  );
}

export function namedSelectOption(entity, fallback = '') {
  return {
    ...entity,
    name: entitySelectLabel(entity, fallback)
  };
}

export function namedSelectOptions(items, fallback = '') {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map(item => namedSelectOption(item, fallback));
}

export function labelValueSelectOptions(items, fallback = '') {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map(item => ({
      label: entitySelectLabel(item, fallback),
      value: entitySelectValue(item)
    }))
    .filter(option => option.value);
}
