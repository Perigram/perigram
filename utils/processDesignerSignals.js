// One category-signal map for the process designer: palette chips and
// canvas nodes share it, so a chip reads like the node it creates. The
// names describe meaning, not hue (signal tokens, components/README
// "Visual Tokens").
const PALETTE_GROUP_SIGNALS = {
  types: 'structure',
  operations: 'effect',
  control: 'decision',
  instances: 'reference',
  values: 'value',
  listTree: 'data',
  services: 'entity'
};

export const signalForPaletteGroup = groupId => PALETTE_GROUP_SIGNALS[groupId] || 'identity';
