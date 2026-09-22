<template>
  <GeneratedMappingScreen
    :screen="screen"
    :contract="{ actions: processActions }"
    :bundle="processBundle"
    :instances="instanceGroups"
    :source-states="poolStates"
    :on-run="runAction"
    :on-open="openInstance"
  />
</template>

<script setup>
// The embedded typeList screen surface: one canonical host for compiled
// typeList screens outside the routed page. Loads the screen's sources
// through the instances store pool (the generator's data layer) and
// renders through the ui-mapping engine, so a type screen renders with
// the same CTS render contract in the routed page, desktop workspace
// panes, and mobile home tabs. Instance navigation stays with the host:
// `open-instance` emits the instance, the host decides where it opens.
import { computed, ref, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import { isCreateAction } from '~/components/generated/action-visibility.js';
import { resolveCreatedInstanceOpen } from '~/components/generated/created-instance-open.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { isOfflineQueuedError } from '~/utils/outbox.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';

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
      if (target?.kind === 'route') {
        await navigateTo(target.route);
        return;
      }
      if (target?.kind === 'workspace') {
        toast.add({ severity: 'success', summary: t('common.created'), detail: target.name || target.typeId, life: 4000 });
        openInstanceInWorkspace({ typeId: target.typeId, instanceId: target.instanceId });
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
</script>
