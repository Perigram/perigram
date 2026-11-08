<template>
  <div class="state-declaration-form flex flex-col gap-3">
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
    <div class="state-declaration-grid">
      <div class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('processDesigner.stateSeverity') }}</label>
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
      <div class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('processDesigner.stateIcon') }}</label>
        <GlyphSelect
          :model-value="icon || ''"
          :aria-label="$t('processDesigner.stateIcon')"
          @update:model-value="next => emit('update:icon', next)"
        />
      </div>
    </div>
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
  icon: { type: String, default: '' },
  removable: { type: Boolean, default: false }
});

const emit = defineEmits(['update:value', 'update:severity', 'update:icon', 'remove']);

const { t } = useI18n();
const severityOptions = stateSeverityOptions(t);
</script>

<style scoped>
.state-declaration-form {
  container-type: inline-size;
}

.state-declaration-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

@container (min-width: 24rem) {
  .state-declaration-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
