// Classes (SPEC §5): declaration presets — obligations over facets, no machinery.
const CLASSES = Object.freeze(['party', 'file', 'item', 'group', 'process']);

// Authorable classes: party types are framework-only (R6), so org
// declarations and every class picker offer exactly these four. Single
// source — no page keeps its own class list.
export const DECLARABLE_CLASSES = Object.freeze(CLASSES.filter(className => className !== 'party'));

// R6: class obligations checked at type-compile. `context.childTypes` is the
// set of type ids that appear as children in some lineage edge — derived
// items (instance, remnant) identify through their parent edge, which is a
// legitimate identity law the extraction surfaced.
export function checkClassObligations(type = {}, context = {}) {
  const errors = [];
  const { class: className, payload, fields = {}, edges = {} } = type;
  if (!CLASSES.includes(className)) {
    return [`type ${type.id}: unknown class ${className}`];
  }

  switch (className) {
    case 'party':
      if (type.scope !== 'system') errors.push(`type ${type.id}: party types are framework-only`);
      break;
    case 'file':
      if (!payload && Object.keys(fields).length === 0) errors.push(`type ${type.id}: file requires payload or fields`);
      if (edges?.children) errors.push(`type ${type.id}: file may not declare lineage children`);
      break;
    case 'item':
      if (payload) errors.push(`type ${type.id}: item may not declare payload`);
      break;
    case 'group':
      if (!edges?.children || Object.keys(edges.children).length === 0) {
        errors.push(`type ${type.id}: group requires lineage children`);
      }
      break;
    case 'process':
      if (payload) errors.push(`type ${type.id}: process may not declare payload`);
      break;
    default: break;
  }
  return errors;
}

// SPEC §5 containment predicate: a file's identity is its content, so file
// types never declare lineage children; membership-bearing classes (item,
// group, process) may. The single seam for authoring-surface legality
// checks (wire gates, tree diagnostics) so the designer and the
// type-compile obligations can never disagree.
export function classMayDeclareChildren(className = '') {
  return className === 'item' || className === 'group' || className === 'process';
}
