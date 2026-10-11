<template>
  <StateBlock v-if="status === 'loading'" state="loading" :message="$t('common.loading')" />
  <Message v-else-if="status === 'error'" :severity="errorSeverity" :closable="false">{{ errorMessage }}</Message>
  <component :is="mounted" v-else-if="mounted" :record="record" :persistence="persistence" />
</template>

<script setup>
import { onMounted, shallowRef, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';
import { surfaceHostContext, editorSurfacePersistence } from '~/components/generated/remote-surface-mount.js';
import { isSupportedSurfaceContract } from '#shared/plugin-surfaces.js';

// The remote-surface loader: mounts a plugin-delivered editor module
// (SPEC §Plugin marketplace, owner decision 2026-10-11) inside whatever
// host chrome opened it — the editor dialog or a workspace page tab. The
// module loads from the install-resolved executor URL, is created through
// the host context (the consistency law: host vue, host primitives, host
// locale), and receives only the record and the persistence callbacks.
// Remote editors are online-only; every failure state says so instead of
// pretending.
const props = defineProps({
  record: { type: Object, default: null },
  typeId: { type: String, required: true },
  // The served surface declaration: { id, url, surfaceContract }.
  surface: { type: Object, required: true }
});

const { t, te, locale } = useI18n();
const status = ref('loading');
const errorSeverity = ref('warn');
const mounted = shallowRef(null);
const persistence = editorSurfacePersistence(props.typeId);

function fail(severity, key) {
  errorSeverity.value = severity;
  errorMessage.value = te(key) ? t(key) : t('pluginSurfaces.unavailable');
  status.value = 'error';
}

const errorMessage = ref('');

onMounted(async () => {
  if (!isSupportedSurfaceContract(props.surface?.surfaceContract)) {
    fail('error', 'pluginSurfaces.unsupported');
    return;
  }
  if (!props.surface?.url) {
    fail('warn', 'pluginSurfaces.notConnected');
    return;
  }
  try {
    const module = await import(/* @vite-ignore */ props.surface.url);
    const createSurface = module.default;
    if (typeof createSurface !== 'function') {
      fail('error', 'pluginSurfaces.unsupported');
      return;
    }
    mounted.value = createSurface(surfaceHostContext({ t, te, locale }));
    status.value = 'ready';
  } catch {
    fail('warn', 'pluginSurfaces.unavailable');
  }
});
</script>
