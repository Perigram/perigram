import { labelKeyForType } from '~/utils/design-system-contract.js';
import { typeLabelKey, localizedLabel } from '#shared/ui-mapping/index.js';
import { useRegistryStore } from '~/stores/registry';
import { isCreateAction, isRelationLinkAction, isUpdateAction } from '~/utils/action-visibility.js';

// The entity-label fallback chain is `name` → localized unnamed
// placeholder: the authored type name from the CTS client bundle riding
// auth hydration (the registry store is the runtime consumption
// contract) is the only non-i18n source — humanized raw ids never
// render. Guarded: contexts without an active Pinia (specs, pure utils)
// keep the placeholder fallback.
function authoredTypeLabel(typeId = '', { t } = {}) {
  if (!typeId) return '';
  try {
    return useRegistryStore().typeRecord(typeId)?.name || '';
  } catch {
    return '';
  }
}

function unnamedLabel({ t, te } = {}) {
  if (typeof te === 'function' && te('common.unnamed') && typeof t === 'function') return t('common.unnamed');
  return 'Unnamed';
}

export function generatedEntityLabel(typeId = '', { t, te } = {}) {
  const key = labelKeyForType(typeId);
  if (key && canTranslate(te, key)) return t(key);
  const mapped = localizedLabel({ t, te }, typeLabelKey(typeId), '');
  if (mapped) return mapped;
  return authoredTypeLabel(typeId, { t }) || unnamedLabel({ t, te });
}

export function generatedScreenLabel(screen = {}, { t, te } = {}) {
  if (screen.labelKey && canTranslate(te, screen.labelKey)) return t(screen.labelKey);
  if (screen.template === 'home') return t('generatedScreen.home');
  if (screen.typeId) return generatedEntityLabel(screen.typeId, { t, te });
  return meaningfulLabel(screen.label) || unnamedLabel({ t, te });
}

export function generatedRegionLabel(region = {}, source = {}, { t, te } = {}) {
  if (region.labelKey && canTranslate(te, region.labelKey)) return t(region.labelKey);
  if (source.typeId) return generatedEntityLabel(source.typeId, { t, te });
  return meaningfulLabel(region.label || source.label) || unnamedLabel({ t, te });
}

function actionTypeOf(action = {}) {
  return action.typeId || '';
}

function relationLinkTarget(action = {}) {
  if (!isRelationLinkAction(action)) return '';
  return [].concat(action.relationMutation?.targetTypes || action.relation?.targetTypes || [])[0] || '';
}

export function generatedActionLabel(action = {}, fallback = '', { t, te } = {}) {
  if (isCreateAction(action)) return generatedEntityLabel(actionTypeOf(action), { t, te }) || fallback;
  const relationTarget = relationLinkTarget(action);
  if (relationTarget) return generatedEntityLabel(relationTarget, { t, te }) || fallback;

  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, action)) return explicit;

  if (isUpdateAction(action)) return action.state?.to ? t('generatedScreen.actions.change') : t('common.edit');
  if (action.actionKind === 'runCommand') return meaningfulLabel(action.commandId) || t('generatedScreen.actions.run');
  if (action.actionKind === 'sendToOrganization') return t('generatedScreen.actions.send');
  return fallback || t('common.confirm');
}

function isGenericActionLabel(label = '', action = {}) {
  const normalized = label.trim().toLowerCase();
  const statusValues = [action.state?.from, action.state?.to].filter(Boolean).map(value => String(value).toLowerCase());
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
