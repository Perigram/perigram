import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';

const ENTITY_CONTRACTS_BY_TYPE = new Map(DESIGN_SYSTEM_ENTITY_CONTRACTS.flatMap(entry => [
  [entry.entityType, entry],
  [entry.key, entry]
]));

export function generatedEntityLabel(entityType = '', { t, te } = {}) {
  const key = ENTITY_CONTRACTS_BY_TYPE.get(entityType)?.labelKey;
  if (key && canTranslate(te, key)) return t(key);
  return humanize(entityType);
}

export function generatedScreenLabel(screen = {}, { t, te } = {}) {
  if (screen.labelKey && canTranslate(te, screen.labelKey)) return t(screen.labelKey);
  if (screen.template === 'home') return t('generatedScreen.home');
  if (screen.entityType) return generatedEntityLabel(screen.entityType, { t, te });
  return meaningfulLabel(screen.label || screen.id || screen.screenKey);
}

export function generatedRegionLabel(region = {}, source = {}, { t, te } = {}) {
  if (region.labelKey && canTranslate(te, region.labelKey)) return t(region.labelKey);
  if (source.entityType) return generatedEntityLabel(source.entityType, { t, te });
  return meaningfulLabel(region.label || source.label || region.id || source.id);
}

export function generatedActionLabel(action = {}, fallback = '', { t, te } = {}) {
  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, action)) return explicit;

  if (action.actionKind === 'createEntity') return generatedEntityLabel(action.entityType, { t, te }) || fallback;
  if (action.actionKind === 'changeStatus') return t('generatedScreen.actions.change');
  if (action.actionKind === 'updateEntity') return t('common.edit');
  if (action.actionKind === 'runCommand') return meaningfulLabel(action.commandId) || t('generatedScreen.actions.run');
  if (action.actionKind === 'sendToOrganization') return t('generatedScreen.actions.send');
  return fallback || t('common.confirm');
}

export function isGenericActionLabel(label = '', action = {}) {
  const normalized = label.trim().toLowerCase();
  const statusValues = [action.status?.from, action.status?.to].filter(Boolean).map(value => String(value).toLowerCase());
  const genericWords = [
    'create',
    'status',
    'service',
    'update',
    'send',
    'action',
    'move',
    action.actionKind?.toLowerCase?.()
  ].filter(Boolean);
  return genericWords.some(word => normalized === word || normalized.startsWith(`${word} `))
    || statusValues.some(status => normalized === status || normalized.includes(status));
}

function canTranslate(te, key) {
  return typeof te === 'function' ? te(key) : Boolean(key);
}

function meaningfulLabel(value = '') {
  const label = humanize(value);
  return label || value;
}

function humanize(value = '') {
  return String(value || '')
    .replace(/^auto_role_[^_]+_/, '')
    .replace(/^home_/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
