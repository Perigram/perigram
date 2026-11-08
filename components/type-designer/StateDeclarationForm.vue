<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <InputText
        :model-value="value"
        size="small"
        class="min-w-0 flex-1"
        :placeholder="$t('typeCanvas.stateName')"
        :aria-label="$t('typeCanvas.stateName')"
        @update:model-value="next => emit('update:value', String(next || ''))"
      />
      <Button
        v-if="removable"
        icon="pi pi-trash"
        size="small"
        text
        severity="danger"
        :aria-label="$t('common.delete')"
        :title="$t('common.delete')"
        @click="emit('remove')"
      />
    </div>
    <div class="flex items-center gap-2">
      <Select
        :model-value="severity || 'info'"
        :options="severityOptions"
        option-label="label"
        option-value="value"
        size="small"
        class="w-40 shrink-0"
        :aria-label="$t('processDesigner.stateSeverity')"
        @update:model-value="next => emit('update:severity', next || 'info')"
      />
      <InputText
        :model-value="icon || ''"
        size="small"
        class="w-52 shrink-0"
        :placeholder="$t('processDesigner.stateIcon')"
        :aria-label="$t('processDesigner.stateIcon')"
        @update:model-value="next => emit('update:icon', String(next || '').trim())"
      />
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { stateSeverityOptions } from '~/components/type-designer/state-severities.js';

defineProps({
  value: { type: String, default: '' },
  severity: { type: String, default: 'info' },
  icon: { type: String, default: '' },
  removable: { type: Boolean, default: false }
});

const emit = defineEmits(['update:value', 'update:severity', 'update:icon', 'remove']);

const { t } = useI18n();
const severityOptions = stateSeverityOptions(t);
</script>
