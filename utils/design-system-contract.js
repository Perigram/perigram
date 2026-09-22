import {
  CNC_ACTION_DISPLAYS,
  CNC_DATA_DISPLAYS,
  CNC_PREVIEW_MODES,
  CNC_RELATION_DISPLAYS,
  cncDesignSystemInstanceContracts,
  cncDesignSystemGroups,
  cncDesignSystemPrimitives,
  cncDesignSystemVariants,
  cncInstanceFieldGroups,
  cncInstanceSurfaceContracts
} from '../packages/domain-cnc/src/index.js';
import { findEntityFieldPolicy } from '../shared/instance-field-access.js';

export const DESIGN_SYSTEM_VARIANTS = cncDesignSystemVariants;
export const DESIGN_SYSTEM_GROUPS = cncDesignSystemGroups;
export const DESIGN_SYSTEM_PRIMITIVES = cncDesignSystemPrimitives;
export const DESIGN_SYSTEM_ENTITY_CONTRACTS = cncDesignSystemInstanceContracts;
export const DESIGN_SYSTEM_FIELD_GROUPS = cncInstanceFieldGroups;
export const DESIGN_SYSTEM_SURFACES = cncInstanceSurfaceContracts;

export function validateDesignSystemContracts(entries = DESIGN_SYSTEM_ENTITY_CONTRACTS) {
  return entries.flatMap((entry) => {
    const issues = [];
    if (!entry.key) issues.push('missing key');
    if (!entry.typeId) issues.push('missing entity type');
    if (!entry.group) issues.push('missing group');
    if (!entry.labelKey) issues.push('missing label key');
    if (!entry.propName) issues.push('missing prop name');
    if (!entry.factoryName) issues.push('missing factory name');
    if (!['interactive', 'hidden', 'readonly'].includes(entry.status)) issues.push('invalid status policy');
    if (typeof entry.trace !== 'boolean') issues.push('invalid trace policy');
    if (!Array.isArray(entry.docs) || entry.docs.length === 0) issues.push('missing docs');
    if (!DESIGN_SYSTEM_SURFACES[entry.key]) issues.push('missing surface contract');

    return issues.map((issue) => ({ key: entry.key || 'unknown', issue }));
  });
}

export function validateDesignSystemDisplayContracts(entries = DESIGN_SYSTEM_ENTITY_CONTRACTS) {
  return entries.flatMap((entry) => {
    const contract = DESIGN_SYSTEM_SURFACES[entry.key];
    const groups = DESIGN_SYSTEM_FIELD_GROUPS[entry.key] || {};
    const issues = [];

    for (const surface of ['inline', 'compact', 'card', 'detail']) {
      if (!contract?.surfaces?.[surface]) issues.push({ surface, issue: 'missing required surface' });
    }

    for (const [surface, definition] of Object.entries(contract?.surfaces || {})) {
      if (!CNC_PREVIEW_MODES.includes(definition.preview || 'none')) issues.push({ surface, issue: 'invalid preview mode' });
      if (!CNC_DATA_DISPLAYS.includes(definition.dataDisplay || 'grid')) issues.push({ surface, issue: 'invalid data display' });
      if (!CNC_RELATION_DISPLAYS.includes(definition.relations || 'none')) issues.push({ surface, issue: 'invalid relation display' });
      if (!CNC_ACTION_DISPLAYS.includes(definition.actions || 'none')) issues.push({ surface, issue: 'invalid action display' });

      for (const groupName of definition.fieldGroups || []) {
        const fields = groups[groupName];
        if (!fields) {
          issues.push({ surface, group: groupName, issue: 'missing field group' });
          continue;
        }

        for (const field of fields) {
          const paths = [field.path, ...(field.fallbackPaths || [])].filter(Boolean);
          for (const path of paths) {
            if (!findEntityFieldPolicy(entry.typeId, path)) {
              issues.push({ surface, group: groupName, path, issue: 'field path missing access policy' });
            }
          }
        }
      }
    }

    return issues.map(issue => ({ key: entry.key || 'unknown', ...issue }));
  });
}
