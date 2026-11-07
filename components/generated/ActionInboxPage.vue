<template>
  <StateBlock v-if="loading" state="loading" />
  <StateBlock v-else-if="error" state="error" :message="error" />
  <StateBlock v-else-if="!groups.length" state="empty" icon="pi pi-inbox" />
  <div v-else class="flex flex-col gap-6">
    <section v-for="group in groups" :key="group.typeId" class="flex min-w-0 flex-col gap-2">
      <span class="text-label text-muted">{{ group.label }}</span>
      <div class="flex flex-col gap-2">
        <InstanceInlineRef
          v-for="row in group.rows"
          :key="row.instanceId"
          variant="tile"
          trace
          :type="row.typeId"
          :id="row.instanceId"
          :entity="row.dto"
          :fetch="false"
        >
            <template #trailing>
              <ActionButton
                v-for="action in row.actions"
                :key="action.id"
                :action="action"
                :state-policy="statePolicy[row.typeId] || null"
                @run="action => runRowAction(action, row)"
              />
            </template>
        </InstanceInlineRef>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import { statePolicyByType } from '#shared/ui-mapping/index.js';
import { refusalFailuresOf } from '~/utils/action-failures.js';
import { isOfflineQueuedError } from '~/utils/outbox.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import StateBlock from '~/components/shared/StateBlock.vue';
import ActionButton from '~/components/ui-mapping/ActionButton.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { deriveInboxRows } from '~/components/generated/action-inbox-rows.js';

// The action inbox (SPEC §4): one row per instance whose current state
// admits an action the user's roles grant — the §22.13 tile with its
// admissible actions beside it, grouped by type; every tile carries its
// lineage chain at its own top (rows sit outside their parents).
// Rows run actions
// through the instances store's action-run channel and reconcile away
// through the shared entity-event invalidation as states move.
const { t, te } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const instances = useInstancesStore();

const loading = ref(true);
const error = ref('');
const items = ref([]);
const hydratedTypes = ref(new Set());

const actions = computed(() => authStore.processPayload?.actions || {});
const statePolicy = computed(() => statePolicyByType(authStore.processPayload?.producerOutputs || {}));

const rows = computed(() => deriveInboxRows(items.value, {
  dtoFor: (typeId, id) => instances.dtoFor(instances.canonicalTypeKey(typeId), String(id)),
  actions: actions.value,
  hydratedTypes: hydratedTypes.value
}));

const groups = computed(() => {
  const byType = new Map();
  for (const row of rows.value) {
    const list = byType.get(row.typeId) || [];
    list.push(row);
    byType.set(row.typeId, list);
  }
  return [...byType.entries()]
    .map(([typeId, list]) => ({ typeId, label: generatedEntityLabel(typeId, { t, te }), rows: list }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const response = await $fetch('/api/process-definitions/active/inbox');
    items.value = response?.items || [];
    const types = [...new Set(items.value.map(item => item.typeId).filter(Boolean))];
    await Promise.all(types.map(async (typeId) => {
      try {
        await instances.listInstances(instances.canonicalTypeKey(typeId));
      } catch {
        // An unreadable type lists nothing: its rows drop at the pool cut.
      }
      hydratedTypes.value.add(typeId);
    }));
  } catch (err) {
    error.value = err?.data?.message || err?.message || t('generatedScreen.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (!import.meta.server) load();
});

async function runRowAction(action, row) {
  try {
    await instances.runAction({
      action,
      actionId: action.id,
      instanceId: row.instanceId,
      entities: {},
      data: {},
      parameters: {}
    });
    toast.add({ severity: 'success', summary: action.label || action.id, detail: t('generatedScreen.actionCompleted'), life: 2000 });
  } catch (error_) {
    if (isOfflineQueuedError(error_)) {
      toast.add({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
      return;
    }
    const failures = refusalFailuresOf(error_);
    toast.add({
      severity: 'error',
      summary: action.label || action.id,
      detail: failures
        ? failures.map(failure => [failure.name, failure.message].filter(Boolean).join(' — ')).join('\n')
        : (error_?.data?.message || error_?.message || ''),
      life: 6000
    });
  }
}
</script>
