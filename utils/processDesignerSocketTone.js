const TYPE_TONES = {
  entity: 'reference',
  entityRef: 'reference',
  entity_list: 'reference',
  block: 'structure',
  number: 'quantity',
  integer: 'quantity',
  boolean: 'decision',
  predicate: 'decision',
  status: 'decision',
  date: 'temporal',
  dateTime: 'temporal',
  duration: 'temporal',
  attachment: 'external',
  attachmentRef: 'external',
  task: 'effect',
  event: 'effect'
};

function socketBase(port = {}) {
  const type = port.type || {};
  if (type.base === 'array' && type.itemType?.base) return type.itemType.base;
  return type.base || port.base || port.kind || '';
}

// The socket grammar (canonical contract: components/process-designer
// README, "Node UI contract"). `processSocketKind` classifies a port for
// COLOR resolution (events resolve to the primary accent, declaration
// bindings to the structure family); the handle MARK is one uniform
// filled circle for every kind — shape encodes nothing. Access
// (Item/List/Tree) is deliberately neither — a socket accepts all three
// and access stays a runtime/hover fact.
export function processSocketKind(port = {}) {
  if (port.plane === 'declaration') return 'declaration';
  if ((port.role && port.role !== 'data') || port.type?.base === 'event') return 'event';
  if (port.type?.base === 'status') return 'status';
  return 'data';
}

export function processSocketTone(port = {}) {
  // Projections keep their own tone (README "Node UI contract"): a projected
  // output socket is a read projection of its source, not an ordinary
  // reference payload.
  if (port.projection === true || port.kind === 'projection') return 'projection';
  return TYPE_TONES[socketBase(port)] || 'data';
}

export function processSocketColor(port = {}) {
  // Events carry no payload family — the primary accent is their channel.
  if (processSocketKind(port) === 'event') return 'var(--p-primary-color)';
  return `var(--ck-signal-${processSocketTone(port)})`;
}

// Handle paint: the payload-family color on the one uniform filled
// circle. Every socket renders the same mark; a manual trigger is simply
// an event socket with no wire attached.
export function processSocketHandleStyle(port = {}) {
  const color = processSocketColor(port);
  return { backgroundColor: color, borderColor: color };
}
