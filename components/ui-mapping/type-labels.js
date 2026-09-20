import { useI18n } from 'vue-i18n';
import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';

// Generator-surface type labels keep localization parity with the legacy
// renderer: the design-system entity contracts (entities.* locale keys)
// win for pack types; org-authored types fall back to their authored
// render label; the raw id is the last resort. One helper for every
// ui-mapping materialization — components never resolve type names
// directly from the bundle.
const CONTRACTS_BY_TYPE = new Map(DESIGN_SYSTEM_ENTITY_CONTRACTS.flatMap(entry => [
  [entry.entityType, entry],
  [entry.key, entry]
]));

export function useLocalizedTypeLabel() {
  const { t, te } = useI18n();
  function localizedTypeLabel(type = {}) {
    const key = CONTRACTS_BY_TYPE.get(type.id)?.labelKey;
    if (key && te(key)) return t(key);
    return type.render?.label || type.id || '';
  }
  function localizedTypeLabelById(typeId = '', types = []) {
    const type = (types || []).find(candidate => candidate.id === typeId) || { id: typeId };
    return localizedTypeLabel(type);
  }
  return { localizedTypeLabel, localizedTypeLabelById };
}
