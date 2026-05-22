import { createDomainUiAdapter } from '@cutkit/vue';
import { cncDomain } from '@cutkit/domain-cnc';

const fallbackDomainUi = createDomainUiAdapter(cncDomain);

export function useCutkitDomainUi() {
  try {
    return useNuxtApp().$cutkitDomainUi || fallbackDomainUi;
  } catch {
    return fallbackDomainUi;
  }
}
