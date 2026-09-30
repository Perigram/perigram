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

// Literal class names only: Tailwind generates utilities from source
// text, so dynamic `` bg-signal-${x} `` strings compile to nothing. Keep
// every class spelled out here (tailwind.config scans utils/).
const SIGNAL_BG_CLASSES = {
  identity: 'bg-signal-identity',
  entity: 'bg-signal-entity',
  reference: 'bg-signal-reference',
  structure: 'bg-signal-structure',
  data: 'bg-signal-data',
  quantity: 'bg-signal-quantity',
  decision: 'bg-signal-decision',
  projection: 'bg-signal-projection',
  external: 'bg-signal-external',
  value: 'bg-signal-value',
  effect: 'bg-signal-effect',
  temporal: 'bg-signal-temporal'
};

export const signalBgClass = signal => SIGNAL_BG_CLASSES[signal] || SIGNAL_BG_CLASSES.identity;
