// Palette provenance is semantic, not a visual synonym for framework.
// Reusable graph invocations have their own discovery tier, separate from
// ordinary platform operations and installed plugin contributions.
export function processDesignerPaletteTiers(groups = [], labels = {}) {
  const tiers = [
    { id: 'graphs', source: group => group.source === 'graphs', label: labels.graphs },
    { id: 'pack', source: group => group.source === 'plugin', label: labels.plugins },
    { id: 'framework', source: group => !['graphs', 'plugin'].includes(group.source), label: labels.framework }
  ];
  return tiers.map(tier => ({
    id: tier.id,
    label: tier.label || '',
    groups: (groups || []).filter(group => tier.source(group) && group.items?.length)
  })).filter(tier => tier.groups.length);
}