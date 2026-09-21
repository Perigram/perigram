import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';
import { useRegistryStore } from '~/stores/registry';
import { isCreateAction, isRelationLinkAction, isUpdateAction } from '~/components/generated/action-visibility.js';

const ENTITY_CONTRACTS_BY_TYPE = new Map(DESIGN_SYSTEM_ENTITY_CONTRACTS.flatMap(entry => [
  [entry.typeId, entry],
  [entry.key, entry]
]));

// The authored render label from the CTS client bundle riding auth
// hydration (the registry store is the runtime consumption contract).
// Guarded: contexts without an active Pinia (specs, pure utils) keep the
// deterministic fallbacks below.
function authoredTypeLabel(typeId = '') {
  if (!typeId) return '';
  try {
    return useRegistryStore().renderOf(typeId).label || '';
  } catch {
    return '';
  }
}

export function generatedEntityLabel(typeId = '', { t, te } = {}) {
  const key = ENTITY_CONTRACTS_BY_TYPE.get(typeId)?.labelKey;
  if (key && canTranslate(te, key)) return t(key);
  return authoredTypeLabel(typeId) || humanize(typeId);
}

export function generatedScreenLabel(screen = {}, { t, te } = {}) {
  if (screen.labelKey && canTranslate(te, screen.labelKey)) return t(screen.labelKey);
  if (screen.template === 'home') return t('generatedScreen.home');
  if (screen.typeId) return generatedEntityLabel(screen.typeId, { t, te });
  return meaningfulLabel(screen.label || screen.id || screen.screenKey);
}

export function generatedRegionLabel(region = {}, source = {}, { t, te } = {}) {
  if (region.labelKey && canTranslate(te, region.labelKey)) return t(region.labelKey);
  if (source.typeId) return generatedEntityLabel(source.typeId, { t, te });
  return meaningfulLabel(region.label || source.label || region.id || source.id);
}

function actionTypeOf(action = {}) {
  return action.typeId || '';
}

function relationLinkTarget(action = {}) {
  if (!isRelationLinkAction(action)) return '';
  return action.relationMutation?.targetType || action.relation?.targetType || '';
}

export function generatedActionLabel(action = {}, fallback = '', { t, te } = {}) {
  if (isCreateAction(action)) return generatedEntityLabel(actionTypeOf(action), { t, te }) || fallback;
  const relationTarget = relationLinkTarget(action);
  if (relationTarget) return generatedEntityLabel(relationTarget, { t, te }) || fallback;

  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, action)) return explicit;

  if (isUpdateAction(action)) return action.status?.to ? t('generatedScreen.actions.change') : t('common.edit');
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
