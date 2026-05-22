import {
  cncDesignSystemEntityContracts,
  cncDesignSystemGroups,
  cncDesignSystemPrimitives,
  cncDesignSystemVariants
} from '../packages/domain-cnc/src/index.js';

export const DESIGN_SYSTEM_VARIANTS = cncDesignSystemVariants;
export const DESIGN_SYSTEM_GROUPS = cncDesignSystemGroups;
export const DESIGN_SYSTEM_PRIMITIVES = cncDesignSystemPrimitives;
export const DESIGN_SYSTEM_ENTITY_CONTRACTS = cncDesignSystemEntityContracts;

export function validateDesignSystemContracts(entries = DESIGN_SYSTEM_ENTITY_CONTRACTS) {
  return entries.flatMap((entry) => {
    const issues = [];
    if (!entry.key) issues.push('missing key');
    if (!entry.entityType) issues.push('missing entity type');
    if (!entry.group) issues.push('missing group');
    if (!entry.labelKey) issues.push('missing label key');
    if (!entry.propName) issues.push('missing prop name');
    if (!entry.factoryName) issues.push('missing factory name');
    if (!['interactive', 'hidden', 'readonly'].includes(entry.status)) issues.push('invalid status policy');
    if (typeof entry.trace !== 'boolean') issues.push('invalid trace policy');
    if (!Array.isArray(entry.docs) || entry.docs.length === 0) issues.push('missing docs');

    return issues.map((issue) => ({ key: entry.key || 'unknown', issue }));
  });
}
