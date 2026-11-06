<template>
  <div class="group/field-row flex flex-col gap-2 border-b border-chrome-border py-2 last:border-b-0">
    <div class="flex min-w-0 items-center gap-3">
      <Inplace closable @open="draft = field.node.data.name || ''">
        <template #display>
          <div class="flex min-w-0 items-center gap-2 rounded-ui px-1 py-0.5 transition-colors hover:bg-subtle">
            <span class="min-w-0 max-w-72 truncate text-label text-muted">
              {{ field.node.data.name || $t('typeCanvas.fieldName') }}
            </span>
            <i class="pi pi-pencil shrink-0 text-muted text-supporting" aria-hidden="true" />
          </div>
        </template>
        <template #content="{ closeCallback }">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <InputText
              v-model="draft"
              size="small"
              class="w-44"
              :aria-label="$t('typeCanvas.fieldName')"
              @keydown.enter.prevent="commitRename(closeCallback)"
            />
            <Button
              icon="pi pi-check"
              size="small"
              text
              :aria-label="$t('common.save')"
              @click="commitRename(closeCallback)"
            />
            <Button
              icon="pi pi-times"
              size="small"
              text
              severity="secondary"
              :aria-label="$t('common.cancel')"
              @click="closeCallback()"
            />
          </div>
        </template>
      </Inplace>
      <span class="min-w-0 flex-1 truncate text-body">{{ summary }}</span>
      <Tag
        v-if="field.node.data.descriptor?.identifier === true"
        :value="$t('typeDeclaration.identifier')"
        class="shrink-0"
      />
      <div
        class="flex shrink-0 items-center gap-1 transition-opacity duration-150 [@media(hover:hover)]:opacity-60 group-hover/field-row:opacity-100 group-focus-within/field-row:opacity-100 motion-reduce:transition-none"
      >
        <Button
          icon="pi pi-id-card"
          size="small"
          text
          severity="secondary"
          :aria-label="$t('typeDeclaration.identifier')"
          :title="$t('typeDeclaration.identifier')"
          @click="$emit('toggle-identifier')"
        />
        <Button
          icon="pi pi-pencil"
          size="small"
          text
          severity="secondary"
          :aria-label="$t('common.edit')"
          :title="$t('common.edit')"
          :aria-pressed="expanded"
          @click="$emit('toggle-expand')"
        />
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
    </div>
    <div v-if="expanded" class="rounded-ui border border-content-border p-3">
      <DescriptorEditor
        :model-value="field.node.data.descriptor || { base: 'string' }"
        :type-options="typeOptions"
        @update:model-value="value => $emit('descriptor', value)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Inplace from 'primevue/inplace';
import Tag from 'primevue/tag';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';

// Pure presentation — every mutation is an event up to the editor page
// (row contract: components/type-designer/README.md).
defineProps({
  field: { type: Object, required: true },
  summary: { type: String, default: '' },
  typeOptions: { type: Array, default: () => [] },
  expanded: { type: Boolean, default: false }
});

const emit = defineEmits(['rename', 'descriptor', 'toggle-identifier', 'toggle-expand', 'remove']);

const draft = ref('');

function commitRename(close) {
  emit('rename', String(draft.value ?? ''));
  close();
}
</script>
