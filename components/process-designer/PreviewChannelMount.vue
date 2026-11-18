<template>
  <component :is="mounted" v-if="mounted" :record="null" :payload="payload" />
  <!-- The empty state renders while the module loads and whenever it
       cannot (offline executor, refused contract): a channel tab that
       cannot mount stays honest about it. -->
  <StateBlock v-else-if="!loading" :message="$t('processDesigner.previewChannelUnavailable')" />
</template>

<script setup>
import { onBeforeUnmount, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import StateBlock from '~/components/shared/StateBlock.vue';
import { isSupportedSurfaceContract } from '#shared/plugin-surfaces.js';

// One designer preview channel (SPEC §28): a plugin-declared tab mounting
// its preview surface read-only over the graph's preview evaluation —
// the same module mount RemoteInstancePreview rides (contract 1: the
// host injects vue, the component pack, and locale; the module never
// fetches or persists). The channel's payload is the preview evaluation
// result the page hands it; channels author nothing and execute no
// effect species.
const props = defineProps({
  channel: { type: Object, required: true },
  payload: { type: Object, default: null }
});

const { t, te, locale } = useI18n();
const mounted = shallowRef(null);
const loading = shallowRef(true);
let loadToken = 0;
let disposed = false;

watch(
  () => [props.channel?.url, props.channel?.surfaceContract],
  async ([url, surfaceContract]) => {
    const token = ++loadToken;
    mounted.value = null;
    loading.value = true;
    if (!isSupportedSurfaceContract(surfaceContract) || !url) {
      loading.value = false;
      return;
    }
    try {
      const [{ surfaceHostContext }, module] = await Promise.all([
        import('~/components/generated/remote-surface-mount.js'),
        import(/* @vite-ignore */ url)
      ]);
      if (disposed || token !== loadToken) return;
      const createSurface = module.default;
      if (typeof createSurface !== 'function') return;
      mounted.value = createSurface(surfaceHostContext({ t, te, locale }, surfaceContract));
    } catch {
      // Unreachable executor: the unavailable state stays.
    } finally {
      if (!disposed && token === loadToken) loading.value = false;
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  disposed = true;
  loadToken += 1;
  mounted.value = null;
});
</script>
