<template>
  <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_10rem_2.5rem]">
    <InputText
      :model-value="value"
      size="small"
      class="min-w-0"
      :placeholder="$t('typeCanvas.stateName')"
      :aria-label="$t('typeCanvas.stateName')"
      @update:model-value="next => emit('update:value', String(next || ''))"
    />
    <Button
      icon="pi pi-trash"
      size="small"
      text
      severity="danger"
      class="sm:hidden"
      :aria-label="$t('common.delete')"
      :title="$t('common.delete')"
      @click="emit('remove')"
    />
    <div class="col-span-2 flex items-center gap-2 sm:col-span-1 sm:block">
      <span class="text-label text-muted sm:hidden">{{ $t('processDesigner.stateSeverity') }}</span>
      <Select
        :model-value="severity || 'info'"
        :options="severityOptions"
        option-label="label"
        option-value="value"
        size="small"
        class="w-full"
        :aria-label="$t('processDesigner.stateSeverity')"
        @update:model-value="next => emit('update:severity', next || 'info')"
      />
    </div>
    <div class="col-span-2 flex items-center gap-2 sm:col-span-1 sm:block">
      <span class="text-label text-muted sm:hidden">{{ $t('processDesigner.stateIcon') }}</span>
      <GlyphSelect
        :model-value="icon || ''"
        :aria-label="$t('processDesigner.stateIcon')"
        @update:model-value="next => emit('update:icon', next)"
      />
    </div>
    <Button
      icon="pi pi-trash"
      size="small"
      text
      severity="danger"
      class="hidden sm:inline-flex"
      :aria-label="$t('common.delete')"
      :title="$t('common.delete')"
      @click="emit('remove')"
    />
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import GlyphSelect from '~/components/type-designer/GlyphSelect.vue';
import { stateSeverityOptions } from '~/components/type-designer/state-severities.js';

defineProps({
  value: { type: String, default: '' },
  severity: { type: String, default: 'info' },
  icon: { type: String, default: '' }
});

const emit = defineEmits(['update:value', 'update:severity', 'update:icon', 'remove']);

const { t } = useI18n();
const severityOptions = stateSeverityOptions(t);
</script>
