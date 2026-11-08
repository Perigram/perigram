<template>
  <div class="field-declaration-form flex flex-col gap-3">
    <div class="field-declaration-grid">
      <div class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('typeCanvas.fieldName') }}</label>
        <div class="flex items-center gap-2">
          <InputText
            :model-value="name"
            size="small"
            class="min-w-0 flex-1"
            :placeholder="$t('typeCanvas.fieldName')"
            :aria-label="$t('typeCanvas.fieldName')"
            @update:model-value="value => emit('update:name', String(value || ''))"
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
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('classes.type') }}</label>
        <DescriptorBaseControl
          :descriptor="descriptor"
          @update:model-value="value => emit('update:descriptor', value)"
        />
      </div>
    </div>
    <DescriptorEditor
      :model-value="descriptor"
      :type-options="typeOptions"
      :simple="simple"
      details-only
      @update:model-value="value => emit('update:descriptor', value)"
    />
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import DescriptorBaseControl from '~/components/type-designer/DescriptorBaseControl.vue';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';

defineProps({
  name: { type: String, default: '' },
  descriptor: { type: Object, required: true },
  typeOptions: { type: Array, default: () => [] },
  simple: { type: Boolean, default: false },
  removable: { type: Boolean, default: false }
});

const emit = defineEmits(['update:name', 'update:descriptor', 'remove']);
</script>

<style scoped>
.field-declaration-form {
  container-type: inline-size;
}

.field-declaration-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

@container (min-width: 28rem) {
  .field-declaration-grid {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }
}
</style>
