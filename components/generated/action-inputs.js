import { isCreateAction } from '~/utils/action-visibility.js';

export function collectActionInputFields(action = {}) {
  if (action.actionKind === 'runCommand') {
    return (action.inputs || [])
      .filter(field => field.prompt !== false)
      .map(field => ({
        ...field,
        type: field.typeId ? 'entity' : (field.type || (field.kind === 'json' ? 'object' : field.kind) || 'string'),
        path: field.path || (field.typeId ? `entities.${field.id}` : `parameters.${field.id}`)
      }));
  }
  const policyFields = action.inputPolicy?.fields || [];
  const constructionFields = action.construction?.inputs || action.inputs || [];
  return [...policyFields, ...constructionFields]
    .filter((field, index, fields) => fields.findIndex(item => item.id === field.id) === index);
}

export function promptedFields(action = {}) {
  return collectActionInputFields(action)
    .filter(field => !promptFieldHidden(field, action))
    .filter(field => field?.prompt || field?.required);
}

export function promptData(fields = [], values = {}) {
  const data = {};
  for (const field of fields) {
    const value = normalizePromptValue(field, values[field.id] ?? field.default);
    if (value === undefined || value === '') continue;
    setByPath(data, field.path || field.id, value);
  }
  return data;
}

export function initialPromptValue(field = {}) {
  if (field.type === 'typeList') return Array.isArray(field.default) ? field.default : [];
  if (field.type === 'cassetteParameters') return field.default && typeof field.default === 'object' ? { ...field.default } : {};
  if (field.editor === 'artifactTemplateValues') return field.default && typeof field.default === 'object' ? { ...field.default } : {};
  if (field.type === 'enum') return field.default ?? field.options?.[0] ?? '';
  if (field.type === 'boolean') return field.default ?? null;
  if (['date', 'dateTime'].includes(field.type)) {
    const value = field.default ? new Date(field.default) : null;
    return value && !Number.isNaN(value.getTime()) ? value : null;
  }
  if (['object', 'json'].includes(field.type)) return field.default ?? null;
  return field.default ?? '';
}

function promptFieldHidden(field = {}, action = {}) {
  const parentType = action.parentTypeId || '';
  const templateTypeId = field.templateTypeId || field.typeId || '';
  return isCreateAction(action)
    && templateTypeId
    && parentType === templateTypeId
    && field.id === (field.templateFieldId || 'templateId');
}

function normalizePromptValue(field = {}, value) {
  if (field.type === 'number') return value === '' ? undefined : Number(value);
  if (field.type === 'typeList') return normalizeEntityListValue(field, value);
  if (field.type === 'cassetteParameters') return normalizeCassetteParameters(value);
  if (field.type === 'boolean') {
    return value === null || value === undefined || value === '' ? undefined : Boolean(value);
  }
  if (['date', 'dateTime'].includes(field.type)) {
    if (!value) return undefined;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return undefined;
      return field.type === 'date' ? value.toISOString().slice(0, 10) : value.toISOString();
    }
    return value;
  }
  if (['object', 'json'].includes(field.type)) {
    if (!value) return undefined;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

function normalizeCassetteParameters(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== '' && item !== null && item !== undefined)
    .map(([key, item]) => {
      const numeric = Number(item);
      return [key, Number.isFinite(numeric) ? numeric : item];
    }));
}

function normalizeEntityListValue(field = {}, value = []) {
  const ids = Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  if (field.accepts?.includes('cassette')) {
    return ids.map((id, index) => ({
      entryId: `${field.id || 'entry'}_${index + 1}`,
      id,
      typeId: 'cassette',
      quantity: 1
    }));
  }
  return ids.map(id => ({ id }));
}

function setByPath(target, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ||= {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}
