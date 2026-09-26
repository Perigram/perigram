<template>
  <GeneratedMappingScreen
    :screen="screen"
    :contract="{ actions: processActions, statePolicy }"
    :bundle="processBundle"
    :instances="instanceGroups"
    :source-states="poolStates"
    :on-run="runAction"
    :on-open="openInstance"
    :on-patch="runPatch"
  />
</template>

<script setup>
// The embedded scoped-detail surface: one canonical host for compiled
// instanceDetail screens (manifest or synthesized fallback) inside
// workspace panes. Loads the screen's sources through the instances store
// pool and renders through the ui-mapping engine — the same CTS render
// contract as the routed detail surface. Instance navigation stays with
// the host: `open-instance` emits the instance, the workspace decides
// which tab it opens. Created instances resolve through the shared
// created-open contract and emit back into the workspace instead of
// routing away from it.
import { computed, ref, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import { isCreateAction } from '~/components/generated/action-visibility.js';
import { resolveCreatedInstanceOpen } from '~/components/generated/created-instance-open.js';
import { isOfflineQueuedError } from '~/utils/outbox.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { statePolicyByType } from '#shared/ui-mapping/index.js';

const props = defineProps({
  screen: { type: Object, required: true }
});

const emit = defineEmits(['open-instance']);

const toast = useToast();
const { t } = useI18n();
const authStore = useAuthStore();
const instances = useInstancesStore();

const processBundle = computed(() => authStore.processPayload?.bundle || { types: [] });
const processActions = computed(() => authStore.processPayload?.actions || {});
// Per-type state policy from the compiled workflows — the same channel the
// routed screen page passes, so state tags and transition surfaces reach
// the pane detail identically.
const statePolicy = computed(() => statePolicyByType(authStore.processPayload?.producerOutputs || {}));
// The store exposes the keyed pool ({ type -> { id -> instance }}); the
// generator's instances prop is the grouped-array shape.
const instanceGroups = computed(() => Object.fromEntries(
  Object.entries(instances.instancePool || {}).map(([typeKey, byId]) => [typeKey, Object.values(byId)])
));
const poolStates = ref({});

async function reload() {
  const sources = (props.screen.sources || []).filter(source => source.id && source.typeId);
  if (!sources.length) {
    poolStates.value = {};
    return;
  }
  poolStates.value = Object.fromEntries(sources.map(source => [source.id, 'loading']));
  try {
    for (const source of sources) {
      await instances.listInstances(instances.canonicalTypeKey(source.typeId));
      poolStates.value[source.id] = Object.keys(instances.records[instances.canonicalTypeKey(source.typeId)] || {}).length
        ? 'ready'
        : 'empty';
    }
  } catch (err) {
    const denied = err?.status === 403 || err?.statusCode === 403 || err?.data?.statusCode === 403;
    poolStates.value = Object.fromEntries(Object.entries(poolStates.value)
      .map(([id, value]) => [id, value === 'loading' ? (denied ? 'denied' : 'error') : value]));
  }
}

defineExpose({ reload });

watch(() => props.screen, reload, { immediate: true });

async function runAction(action, data = {}, context = {}) {
  const scope = props.screen?.scope || {};
  const instanceId = context.instance?.id || scope.instanceId || null;
  try {
    const result = await instances.runAction({ actionId: action.id, instanceId, entities: {}, data, parameters: {} });
    if (isCreateAction(action)) {
      const target = resolveCreatedInstanceOpen({
        action,
        result,
        screenKey: props.screen?.screenKey || props.screen?.id || '',
        manifest: authStore.screenManifest
      });
      // Created instances open back into the workspace (a detail or editor
      // tab for the created type) instead of routing away from it; without
      // a destination the success toast is the confirmation.
      if (target?.kind === 'route' || target?.kind === 'workspace') {
        toast.add({ severity: 'success', summary: t('common.created'), detail: target.name || target.typeId, life: 4000 });
        emit('open-instance', { type: target.typeId, id: target.instanceId });
        return;
      }
    }
    toast.add({ severity: 'success', summary: action.label || action.id, detail: t('generatedScreen.actionCompleted'), life: 2000 });
    await reload();
  } catch (error) {
    if (isOfflineQueuedError(error)) {
      toast.add({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
      return;
    }
    toast.add({ severity: 'error', summary: action.label || action.id, detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

function openInstance(instance) {
  if (instance?.type && instance?.id) emit('open-instance', instance);
}

// Detail edit patches persist through the generic instance update
// transport; the store's shared entity event reconciles the pool.
async function runPatch({ instance, patch } = {}) {
  if (!instance?.type || !instance?.id) return;
  await instances.updateInstance(instance.type, instance.id, patch);
}
</script>
