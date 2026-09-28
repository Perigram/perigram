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
// README, "Node UI contract"). Shape encodes WHAT KIND of thing a socket
// deals in; color encodes the payload family. The two are orthogonal and
// access (Item/List/Tree) is deliberately neither — a socket accepts all
// three and access stays a runtime/hover fact.
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

// Handle paint by shape channel (node UI contract): data = filled dot,
// declaration = filled diamond, status = filled square, event = RING —
// an outline ring is a MANUAL trigger (the effect runs by hand), a filled
// ring (colored band around a card-colored hole) is WIRED (the trigger
// fires automatically). `wired` is the card's connected-input fact; it
// only discriminates the ring, every other kind stays filled.
export function processSocketHandleStyle(port = {}, wired = false) {
  const color = processSocketColor(port);
  if (processSocketKind(port) === 'event' && !wired) {
    return { backgroundColor: 'transparent', borderColor: color, borderWidth: '2px' };
  }
  if (processSocketKind(port) === 'event') {
    return { backgroundColor: color, borderColor: color, boxShadow: 'inset 0 0 0 3px var(--p-content-background)' };
  }
  return { backgroundColor: color, borderColor: color };
}
