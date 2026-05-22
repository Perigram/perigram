import { createDomainUiAdapter } from '@cutkit/vue';
import { cncDomain } from '@cutkit/domain-cnc';

export default defineNuxtPlugin(() => {
  return {
    provide: {
      cutkitDomainUi: createDomainUiAdapter(cncDomain)
    }
  };
});
