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
    entity?.identity?.name,
    entity?.identity?.slug,
    entity?.identity?.serial,
    entity?.identity?.uid,
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
    entity?.identity?.uid,
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
