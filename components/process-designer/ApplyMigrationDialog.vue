<template>
  <StandardDialog
    :visible="visible"
    size="lg"
    :closable="false"
    @update:visible="$emit('update:visible', $event)"
  >
    <template #header>
      {{ $t('processDesigner.applyMigrationTitle') }}
    </template>
    <div class="flex flex-col gap-3">
      <p class="text-supporting text-muted">{{ $t('processDesigner.applyMigrationIntro') }}</p>
      <div v-for="row in plan.statuses" :key="row.typeId" class="flex flex-col gap-2">
        <div class="text-label">{{ row.typeId }}</div>
        <div
          v-for="removed in row.removed"
          :key="`${row.typeId}|${removed.state}`"
          class="flex flex-wrap items-center gap-3 rounded-ui border border-content-border px-3 py-2"
        >
          <span class="text-technical">{{ removed.state }}</span>
          <span class="text-supporting text-muted">
            {{ $t('processDesigner.applyMigrationCount', { count: removed.count }) }}
          </span>
          <div class="ml-auto flex items-center gap-2">
            <span class="text-supporting text-muted">{{ $t('processDesigner.applyMigrationTarget') }}</span>
            <SelectButton
              :model-value="targets[`${row.typeId}|${removed.state}`]"
              :options="row.targets"
              size="small"
              :aria-label="$t('processDesigner.applyMigrationTargetPlaceholder')"
              @update:model-value="value => setTarget(row.typeId, removed.state, value)"
            />
          </div>
        </div>
        <Message v-if="!row.targets.length" severity="error">
          {{ $t('processDesigner.applyMigrationNoTargets', { typeId: row.typeId }) }}
        </Message>
      </div>
    </div>
    <template #footer>
      <Button
        :label="$t('common.cancel')"
        text
        severity="secondary"
        :disabled="loading"
        @click="$emit('cancel')"
      />
      <Button
        :label="$t('processDesigner.applyMigrationConfirm')"
        :loading="loading"
        :disabled="!complete"
        @click="confirm"
      />
    </template>
  </StandardDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import SelectButton from 'primevue/selectbutton';
import StandardDialog from '~/components/shared/StandardDialog.vue';

// The Apply migration decision surface: one row per removed workflow state
// with a live instance count, one retained-target select per row,
// pre-filled from the draft's declared migrations. Emits the confirmed
// mappings — the composable persists them as a declaration on the draft;
// the executor contract lives in server/features/process-definitions
// (Apply migration plan).
const props = defineProps({
  visible: { type: Boolean, default: false },
  plan: { type: Object, default: null },
  mappings: { type: Array, default: null },
  loading: { type: Boolean, default: false }
});

const emit = defineEmits(['update:visible', 'confirm', 'cancel']);

const targets = ref({});

watch(() => [props.plan, props.mappings], () => {
  targets.value = {};
  if (!props.plan?.statuses) return;
  // Declared mappings win; the sole retained target pre-selects only what
  // the declarations leave open.
  for (const mapping of props.mappings || []) {
    if (mapping?.typeId && mapping?.from && mapping?.to) {
      targets.value[`${mapping.typeId}|${mapping.from}`] = mapping.to;
    }
  }
  for (const row of props.plan.statuses) {
    if (row.targets?.length === 1) {
      for (const removed of row.removed) {
        const key = `${row.typeId}|${removed.state}`;
        if (!targets.value[key]) targets.value[key] = row.targets[0];
      }
    }
  }
});

function setTarget(typeId, state, value) {
  targets.value[`${typeId}|${state}`] = value;
}

const complete = computed(() => {
  const rows = props.plan?.statuses || [];
  return rows.length > 0 && rows.every(row => row.removed.every(({ state }) => targets.value[`${row.typeId}|${state}`]));
});

function confirm() {
  const mappings = [];
  for (const row of props.plan.statuses) {
    for (const { state } of row.removed) {
      const to = targets.value[`${row.typeId}|${state}`];
      if (to) mappings.push({ typeId: row.typeId, from: state, to });
    }
  }
  emit('confirm', mappings);
}
</script>
