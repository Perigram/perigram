<template>
  <StandardDialog
    :visible="visible"
    size="lg"
    :closable="false"
    @update:visible="$emit('update:visible', $event)"
  >
    <template #header>
      {{ $t('processDesigner.typeMigrationTitle') }}
    </template>
    <div class="flex flex-col gap-3">
      <p class="text-supporting text-muted">{{ $t('processDesigner.typeMigrationIntro') }}</p>
      <div v-for="failure in failures" :key="failure.typeId" class="flex flex-col gap-2">
        <div class="text-label">{{ failure.typeName }}</div>
        <div
          v-for="row in rowsByType[failure.typeId] || []"
          :key="`${failure.typeId}|${row.key}`"
          class="flex flex-wrap items-center gap-3 rounded-ui bg-subtle px-3 py-2"
        >
          <span class="text-technical">{{ row.fieldLabel || row.state || row.subject }}</span>
          <template v-if="row.kind === 'rename-field'">
            <span class="text-supporting text-muted">→</span>
            <InputText
              :model-value="answer(failure.typeId, row)"
              size="small"
              :placeholder="$t('processDesigner.typeMigrationNewName')"
              :aria-label="$t('processDesigner.typeMigrationNewName')"
              @update:model-value="value => setAnswer(failure.typeId, row, value)"
            />
          </template>
          <template v-else-if="row.kind === 'rename-enum-value'">
            <span class="text-supporting text-muted">{{ $t('processDesigner.applyMigrationTarget') }}</span>
            <SelectButton
              v-if="row.targets.length"
              :model-value="answer(failure.typeId, row)"
              :options="row.targets"
              size="small"
              :aria-label="$t('processDesigner.applyMigrationTargetPlaceholder')"
              @update:model-value="value => setAnswer(failure.typeId, row, value)"
            />
            <span v-else class="text-supporting text-muted">{{ $t('processDesigner.typeMigrationNoTargetStates') }}</span>
          </template>
          <template v-else-if="row.kind === 'retype-field'">
            <SelectButton
              :model-value="answer(failure.typeId, row) || 'keep'"
              :options="retypeChoices"
              option-label="label"
              option-value="value"
              size="small"
              :aria-label="$t('processDesigner.typeMigrationKeepValue')"
              @update:model-value="value => setAnswer(failure.typeId, row, value)"
            />
          </template>
          <template v-else-if="row.kind === 'add-default-field'">
            <span class="text-supporting text-muted">{{ $t('processDesigner.typeMigrationDefaultValue') }}</span>
            <InputText
              :model-value="answer(failure.typeId, row)"
              size="small"
              :placeholder="$t('processDesigner.typeMigrationDefaultValue')"
              :aria-label="$t('processDesigner.typeMigrationDefaultValue')"
              @update:model-value="value => setAnswer(failure.typeId, row, value)"
            />
          </template>
          <span v-else-if="row.kind === 'remove-field'" class="ml-auto text-supporting text-muted">
            {{ $t('processDesigner.typeMigrationRemove') }}
          </span>
          <span v-else class="ml-auto text-supporting">{{ $t('processDesigner.typeMigrationBlocked') }}</span>
        </div>
        <Message v-for="row in blockedRows(failure.typeId)" :key="`${failure.typeId}|blocked|${row.key}`" severity="error">
          {{ row.reason }}
        </Message>
        <Message v-if="!(rowsByType[failure.typeId] || []).length" severity="info">
          {{ failure.plan.requiredSteps.join('; ') }}
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
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import SelectButton from 'primevue/selectbutton';
import { useI18n } from 'vue-i18n';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import {
  stepsFromTypeMigrationRows,
  typeMigrationRows
} from '~/utils/processDesignerTypeMigrations.js';

// The declared-migration authoring surface (SPEC §11/§14): one row per
// breaking change of a refused declaration post, labeled by the type's
// authored NAME and the field's authored LABEL, offering the declarative
// step that covers it. Confirming emits the steps per typeId — the apply
// composable writes them onto the class nodes and retries the apply; the
// dialog itself is the author's consent (nothing auto-declares). Blocked
// rows (uncoverable changes) show the gate's reason and disable confirm.
const props = defineProps({
  visible: { type: Boolean, default: false },
  failures: { type: Array, default: null },
  vocabulary: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false }
});

const emit = defineEmits(['update:visible', 'confirm', 'cancel']);

const { t } = useI18n();

const retypeChoices = computed(() => [
  { label: t('processDesigner.typeMigrationKeepValue'), value: 'keep' },
  { label: t('processDesigner.typeMigrationSetEmpty'), value: 'empty' }
]);

const answers = ref({});

const rowsByType = computed(() => Object.fromEntries((props.failures || []).map(failure => [
  failure.typeId,
  typeMigrationRows(failure.plan, props.vocabulary[failure.typeId])
])));

watch(() => [props.failures, props.vocabulary], () => {
  answers.value = {};
  // Prefills mirror the pure converters: a rename row starts from its
  // paired field's label, an enum row from the sole retained state (when
  // exactly one remains), retype defaults to keeping the value.
  for (const [typeId, rows] of Object.entries(rowsByType.value)) {
    for (const row of rows) {
      if (row.kind === 'rename-field') answers.value[`${typeId}|${row.key}`] = row.toLabel;
      if (row.kind === 'rename-enum-value' && row.to) answers.value[`${typeId}|${row.key}`] = row.to;
    }
  }
}, { immediate: true });

function answer(typeId, row) {
  return answers.value[`${typeId}|${row.key}`];
}

function setAnswer(typeId, row, value) {
  answers.value[`${typeId}|${row.key}`] = value;
}

function blockedRows(typeId) {
  return (rowsByType.value[typeId] || []).filter(row => row.kind === 'blocked');
}

const complete = computed(() => {
  const failures = props.failures || [];
  if (!failures.length) return false;
  return failures.every(({ typeId }) => (rowsByType.value[typeId] || []).every((row) => {
    if (row.kind === 'blocked') return false;
    if (row.kind === 'rename-field') return Boolean(String(answer(typeId, row) || '').trim());
    if (row.kind === 'rename-enum-value') return Boolean(answer(typeId, row) || row.to);
    return true;
  }));
});

function confirm() {
  const stepsByType = {};
  for (const { typeId } of props.failures) {
    const scoped = Object.fromEntries(Object.entries(answers.value)
      .filter(([key]) => key.startsWith(`${typeId}|`))
      .map(([key, value]) => [key.slice(typeId.length + 1), value]));
    stepsByType[typeId] = stepsFromTypeMigrationRows(rowsByType.value[typeId], scoped);
  }
  emit('confirm', stepsByType);
}
</script>
