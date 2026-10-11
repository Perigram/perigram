<template>
  <component :is="mounted" v-if="mounted" :record="record" :payload="payloadDocument" />
  <!-- The generic preview renders while the module loads and whenever it
       cannot (offline executor, refused contract): a plugin preview
       replaces the generic render only when it actually mounts. -->
  <slot v-else />
</template>

<script setup>
import { onMounted, shallowRef, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { instancePayloadFileUrl } from './file-preview-contract.js';
import { isSupportedSurfaceContract } from '#shared/plugin-surfaces.js';

// The read-only preview mount (M7): loads a plugin-declared preview
// surface module and hands it the record and the parsed payload
// document — the host resolves the payload URL, so the module never
// fetches, persists, or queries. Preview surfaces always target the
// contract-1 context (vue, components, locale); anything else is a
// refused install, never a runtime half-mount. The mount context (and
// the surface-pack graph behind it) resolves lazily at mount time —
// preview slots sit inside every card, and an eager import would pull
// the designer chrome into that cycle.
const props = defineProps({
  record: { type: Object, default: null },
  typeId: { type: String, required: true },
  // The served preview binding: { type, surface, url, surfaceContract }.
  preview: { type: Object, required: true }
});

const { t, te, locale } = useI18n();
const mounted = shallowRef(null);
const payloadDocument = ref(null);
let payloadToken = 0;

async function loadPayload() {
  const token = ++payloadToken;
  payloadDocument.value = null;
  const url = instancePayloadFileUrl(props.record?.payload);
  if (!url) return;
  try {
    const text = await $fetch(url, { responseType: 'text' });
    if (token !== payloadToken) return;
    payloadDocument.value = JSON.parse(text);
  } catch {
    // A payload that will not parse leaves the module the record alone.
  }
}

onMounted(async () => {
  if (!isSupportedSurfaceContract(props.preview?.surfaceContract) || !props.preview?.url) return;
  loadPayload();
  try {
    const [{ surfaceHostContext }, module] = await Promise.all([
      import('~/components/generated/remote-surface-mount.js'),
      import(/* @vite-ignore */ props.preview.url)
    ]);
    const createSurface = module.default;
    if (typeof createSurface !== 'function') return;
    mounted.value = createSurface(surfaceHostContext({ t, te, locale }, props.preview.surfaceContract));
  } catch {
    // Unreachable executor: the generic fallback keeps rendering.
  }
});

watch(() => props.record?.payload?.fileId, loadPayload);
</script>
