import { computed, unref } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { statePolicyByType } from '#shared/ui-mapping/index.js';

// The flat state vocabulary's one client-side source (SPEC §7): the
// compiled producer workflows the hydration payload already carries.
// Types declare nothing about states, so every state surface — generated
// screens and the shared instance chrome alike — derives its per-type
// policy map from here instead of re-deriving it at each mount.
// The canonical resolver contract lives in
// [shared/ui-mapping](../../shared/ui-mapping/README.md).
export const useStatePolicy = () => {
    const authStore = useAuthStore();
    const policyByType = computed(() => statePolicyByType(authStore.processPayload?.producerOutputs || {}, authStore.processPayload?.bundle?.types || []));
    // typeIdGetter: a getter function or a refable value; the returned
    // computed tracks it so mounts follow prop changes.
    const policyFor = typeIdGetter => computed(() => {
        const typeId = typeof typeIdGetter === 'function' ? typeIdGetter() : unref(typeIdGetter);
        return policyByType.value[typeId] || null;
    });
    return { policyByType, policyFor };
};
