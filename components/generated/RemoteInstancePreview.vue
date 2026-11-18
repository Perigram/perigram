<template>
  <component :is="mounted" v-if="mounted" :record="wireRecord" :payload="payloadDocument" />
  <!-- The generic preview renders while the module loads and whenever it
       cannot (offline executor, refused contract): a plugin preview
       replaces the generic render only when it actually mounts. -->
  <slot v-else />
</template>

<script setup>
import { computed, onBeforeUnmount, shallowRef, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useInstancesStore } from '~/stores/instances';
import { instancePayloadFileUrl, parsePluginPreviewPayload } from './file-preview-contract.js';
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

// The module's record is the §3 wire DTO (the authoring contract), not
// the generator's screen instance — preview slots receive screen
// instances, so resolve the pooled wire record by id and fall back to
// whatever the slot carried.
const instances = useInstancesStore();
const wireRecord = computed(() => {
  const id = String(props.record?._id || props.record?.id || '');
  return instances.dtoFor(instances.canonicalTypeKey(props.typeId), id) || props.record;
});

const { t, te, locale } = useI18n();
const mounted = shallowRef(null);
const payloadDocument = ref(null);
let payloadToken = 0;
let surfaceToken = 0;
let disposed = false;

async function loadPayload() {
  const token = ++payloadToken;
  payloadDocument.value = null;
  const url = instancePayloadFileUrl(props.record?.payload);
  if (!url) return;
  try {
    const text = await $fetch(url, { responseType: 'text' });
    if (disposed || token !== payloadToken) return;
    payloadDocument.value = parsePluginPreviewPayload(text, props.record?.payload?.mime);
  } catch {
    // A payload that will not parse leaves the module the record alone.
  }
}

watch(
  () => [
    props.record?.payload?.fileId,
    props.record?.payload?.mime,
    props.record?.payload?.revision,
    props.record?.updatedAt
  ],
  loadPayload,
  { immediate: true }
);

watch(
  () => [props.preview?.url, props.preview?.surfaceContract],
  async ([url, surfaceContract]) => {
    const token = ++surfaceToken;
    mounted.value = null;
    if (!isSupportedSurfaceContract(surfaceContract) || !url) return;
    try {
      const [{ surfaceHostContext }, module] = await Promise.all([
        import('~/components/generated/remote-surface-mount.js'),
        import(/* @vite-ignore */ url)
      ]);
      if (disposed || token !== surfaceToken) return;
      const createSurface = module.default;
      if (typeof createSurface !== 'function') return;
      mounted.value = createSurface(surfaceHostContext({ t, te, locale }, surfaceContract));
    } catch {
      // Unreachable executor: the generic fallback keeps rendering.
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  disposed = true;
  payloadToken += 1;
  surfaceToken += 1;
  mounted.value = null;
});
</script>
