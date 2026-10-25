import * as factories from '~/test-data/factories.js';
import { DESIGN_SYSTEM_CARD_COMPONENTS } from '~/utils/design-system-cards.js';
import {
  DESIGN_SYSTEM_FIELD_GROUPS,
  DESIGN_SYSTEM_ENTITY_CONTRACTS,
  DESIGN_SYSTEM_SURFACES,
  validateDesignSystemContracts,
  validateDesignSystemDisplayContracts
} from '~/utils/design-system-contract.js';

export const DESIGN_SYSTEM_ENTITIES = DESIGN_SYSTEM_ENTITY_CONTRACTS.map((entry) => ({
  ...entry,
  fieldGroups: DESIGN_SYSTEM_FIELD_GROUPS[entry.key] || {},
  surfaces: DESIGN_SYSTEM_SURFACES[entry.key]?.surfaces || {},
  component: DESIGN_SYSTEM_CARD_COMPONENTS[entry.key],
  factory: factories[entry.factoryName]
}));

export function createDesignSystemDemoRows() {
  return DESIGN_SYSTEM_ENTITIES.map((entry) => {
    const entity = entry.factory();
    return {
      ...entry,
      entity,
      props: { [entry.propName]: entity }
    };
  });
}

export function validateDesignSystemManifest(entries = DESIGN_SYSTEM_ENTITIES) {
  const contractIssues = validateDesignSystemContracts(entries);
  const displayIssues = validateDesignSystemDisplayContracts(entries);
  const runtimeIssues = entries.flatMap((entry) => {
    const issues = [];
    if (!entry.component) issues.push('missing component');
    if (typeof entry.factory !== 'function') issues.push('missing factory');

    const entity = entry.factory?.();
    if (!entity?.identity) issues.push('factory missing identity block');
    if (!entity?.origin) issues.push('factory missing origin block');
    if (!entity?.status) issues.push('factory missing status block');
    if (!entity?.lineage) issues.push('factory missing lineage block');
    if (!entity?.attachments) issues.push('factory missing attachments block');
    if (!entity?.data) issues.push('factory missing data block');

    return issues.map((issue) => ({ key: entry.key || 'unknown', issue }));
  });

  return [...contractIssues, ...displayIssues, ...runtimeIssues];
}
