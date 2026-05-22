import { cncDomain } from '~/packages/domain-cnc/src/index.js';

export function bindCncDomainAdapter(registry) {
  if (!registry) throw new Error('CNC domain adapter requires a registry');
  registry.defineDomain(cncDomain);
  return registry;
}
