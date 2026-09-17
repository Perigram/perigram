// Classes (SPEC §5): declaration presets — obligations over facets, no machinery.
export const CLASSES = Object.freeze(['party', 'file', 'item', 'group', 'process']);

// R6: class obligations checked at type-compile.
export function checkClassObligations(type = {}) {
  const errors = [];
  const { class: className, payload, fields = {}, edges = {}, states = {} } = type;
  if (!CLASSES.includes(className)) {
    return [`type ${type.id}: unknown class ${className}`];
  }

  const hasSpecsOrSerial = fields.serial || fields.specs;

  switch (className) {
    case 'party':
      if (type.scope !== 'system') errors.push(`type ${type.id}: party types are framework-only`);
      break;
    case 'file':
      if (!payload && Object.keys(fields).length === 0) errors.push(`type ${type.id}: file requires payload or fields`);
      if (edges?.children) errors.push(`type ${type.id}: file may not declare lineage children`);
      break;
    case 'item':
      if (!states.main) errors.push(`type ${type.id}: item requires states`);
      if (!hasSpecsOrSerial) errors.push(`type ${type.id}: item requires serial or specs`);
      if (payload) errors.push(`type ${type.id}: item may not declare payload`);
      break;
    case 'group':
      if (!edges?.children || Object.keys(edges.children).length === 0) {
        errors.push(`type ${type.id}: group requires lineage children`);
      }
      break;
    case 'process':
      if (!states.main) errors.push(`type ${type.id}: process requires states`);
      if (payload) errors.push(`type ${type.id}: process may not declare payload`);
      break;
    default: break;
  }
  if ((className === 'file' || className === 'group') && states.main) {
    const beyond = states.main.values.filter(state => !['draft', 'active', 'archived'].includes(state));
    if (beyond.length) errors.push(`type ${type.id}: ${className} states beyond publish are deferred (SPEC §19): ${beyond.join(', ')}`);
  }
  return errors;
}
