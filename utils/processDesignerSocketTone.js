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
  return TYPE_TONES[socketBase(port)] || 'data';
}

export function processSocketColor(port = {}) {
  // Events carry no payload family — the primary accent is their channel.
  if (processSocketKind(port) === 'event') return 'var(--p-primary-color)';
  return `var(--ck-signal-${processSocketTone(port)})`;
}

// Every handle is FILLED — shape alone distinguishes kinds, no outline or
// border tricks: data = filled circle, declaration = filled diamond,
// event = filled rounded square (primary), status = filled rounded square.
export function processSocketHandleStyle(port = {}) {
  const color = processSocketColor(port);
  return { backgroundColor: color, borderColor: color };
}
