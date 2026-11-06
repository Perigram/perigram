import { labelKeyForType } from '~/utils/design-system-contract.js';
import { typeLabelFor } from '#shared/ui-mapping/index.js';
import { useRegistryStore } from '~/stores/registry';
import { isCreateAction, isRelationLinkAction, isRelationUnlinkAction, isUpdateAction } from '~/utils/action-visibility.js';
import { creationModeLabel } from '~/packages/processes/src/ui-contract-projection.js';

// The app binding of the one type-label chain (`typeLabelFor`,
// shared/ui-mapping; canonical contract in its README). The registry
// lookup is guarded: contexts without an active Pinia (specs, pure
// utils) keep the placeholder fallback.
function registryTypeRecord(typeId = '') {
  if (!typeId) return null;
  try {
    return useRegistryStore().typeRecord(typeId) || null;
  } catch {
    return null;
  }
}

function unnamedLabel({ t, te } = {}) {
  if (typeof te === 'function' && te('common.unnamed') && typeof t === 'function') return t('common.unnamed');
  return 'Unnamed';
}

export function generatedEntityLabel(type = '', { t, te } = {}) {
  const id = typeof type === 'string' ? type : type?.id || '';
  const record = (typeof type === 'string' ? null : type) || registryTypeRecord(id);
  return typeLabelFor(record || id, {
    t,
    te,
    entitiesLabelKey: labelKeyForType(id),
    unnamedLabel: unnamedLabel({ t, te })
  });
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

// The procedural create caption (SPEC §4) composed from localized parts:
// an authored label wins; the generic `New <Type>` / `New <Type> from
// <Mode>` shape translates through `uiMapping.createCaption*` over the
// one type-label chain and the mode name.
export function generatedCreateLabel(action = {}, { t, te } = {}) {
  if (!isCreateAction(action)) return null;
  const authored = String(action.label || '').trim();
  const mode = creationModeLabel(action.construction?.mode);
  const baseName = registryTypeRecord(actionTypeOf(action))?.name || '';
  const generic = !authored
    || authored === `New ${baseName}`
    || authored === `New ${baseName} from ${mode}`;
  if (!generic) return authored;
  const typeLabel = generatedEntityLabel(actionTypeOf(action), { t, te });
  return mode
    ? t('uiMapping.createCaptionFromMode', { type: typeLabel, mode })
    : t('uiMapping.createCaption', { type: typeLabel });
}

function relationLinkTarget(action = {}) {
  if (!isRelationLinkAction(action)) return '';
  return [].concat(action.relationMutation?.targetTypes || action.relation?.targetTypes || [])[0] || '';
}

export function generatedActionLabel(action = {}, fallback = '', { t, te } = {}) {
  if (isCreateAction(action)) return generatedCreateLabel(action, { t, te }) || fallback;
  const relationTarget = relationLinkTarget(action);
  if (relationTarget) return generatedEntityLabel(relationTarget, { t, te }) || fallback;

  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, action)) return explicit;

  if (isUpdateAction(action)) return action.state?.to ? t('generatedScreen.actions.change') : t('common.edit');
  if (isRelationUnlinkAction(action)) return t('common.unlink');
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
