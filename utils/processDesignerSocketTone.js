const TYPE_TONES = {
  entity: 'entity',
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

export function processSocketTone(port = {}) {
  if (port.role && port.role !== 'data') return 'effect';
  if (port.projection || ['projection', 'patch'].includes(port.kind)) return 'projection';
  return TYPE_TONES[socketBase(port)] || 'data';
}

export function processSocketColor(port = {}) {
  return `var(--ck-signal-${processSocketTone(port)})`;
}

export function processSocketHandleStyle(port = {}) {
  const color = processSocketColor(port);
  return { backgroundColor: color, borderColor: color };
}
