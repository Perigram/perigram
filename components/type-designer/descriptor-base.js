import { FIELD_BASES, UNITS } from '~/packages/cts/src/index.js';

export const descriptorBaseOptions = FIELD_BASES.map(base => ({ label: base, value: base }));

export function switchDescriptorBase(descriptor = {}, base = 'string') {
  const next = { base };
  for (const key of ['label', 'display', 'control', 'identifier', 'depiction']) {
    if (descriptor[key] !== undefined) next[key] = descriptor[key];
  }
  if (descriptor.nullable === true) next.nullable = true;
  if (base === 'quantity') next.unit = descriptor.unit || UNITS[0];
  if (base === 'ref') {
    next.accepts = descriptor.accepts?.length ? descriptor.accepts : [];
    if (descriptor.unlink === 'delete') next.unlink = 'delete';
  }
  return next;
}
