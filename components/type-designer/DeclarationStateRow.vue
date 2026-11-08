<template>
  <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_10rem_8rem_auto] items-center gap-2 py-1.5">
    <InputText
      :model-value="state.value || ''"
      size="small"
      class="min-w-0"
      :placeholder="$t('typeCanvas.stateName')"
      :aria-label="$t('typeCanvas.stateName')"
      @update:model-value="value => $emit('rename', String(value || ''))"
    />
    <Select
      :model-value="state.severity || 'info'"
      :options="severityOptions"
      option-label="label"
      option-value="value"
      size="small"
      :aria-label="$t('processDesigner.stateSeverity')"
      @update:model-value="value => $emit('severity', value || 'info')"
    />
    <IconField>
      <InputIcon v-if="state.icon" :class="state.icon" aria-hidden="true" />
      <InputText
        :model-value="state.icon || ''"
        size="small"
        class="w-full"
        :placeholder="$t('processDesigner.stateIcon')"
        :aria-label="$t('processDesigner.stateIcon')"
        @update:model-value="value => $emit('icon', String(value || '').trim() || '')"
      />
    </IconField>
    <Button
      icon="pi pi-trash"
      size="small"
      text
      severity="danger"
      :aria-label="$t('common.delete')"
      :title="$t('common.delete')"
      @click="$emit('remove')"
    />
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/InstanceSelect.vue';
import { stateSeverityOptions } from '~/components/type-designer/state-severities.js';

defineProps({
  state: { type: Object, required: true }
});

defineEmits(['rename', 'severity', 'icon', 'remove']);

const { t } = useI18n();
const severityOptions = stateSeverityOptions(t);
</script>
