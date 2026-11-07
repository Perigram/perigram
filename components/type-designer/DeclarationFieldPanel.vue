<template>
  <div class="flex w-[26rem] max-w-[86vw] flex-col gap-3">
    <div class="flex flex-col gap-1">
      <label class="text-label text-muted">{{ $t('typeCanvas.fieldName') }}</label>
      <InputText
        :model-value="field.node.data.name || ''"
        size="small"
        :placeholder="$t('typeCanvas.fieldName')"
        :aria-label="$t('typeCanvas.fieldName')"
        @update:model-value="value => authoring.renameField(field.node, value)"
      />
    </div>
    <div class="rounded-ui border border-content-border p-3">
      <DescriptorEditor
        :model-value="field.node.data.descriptor || { base: 'string' }"
        :type-options="typeOptions"
        @update:model-value="value => authoring.setDescriptor(field.node, value)"
      />
    </div>
    <div class="flex items-center gap-1">
      <Button
        icon="pi pi-id-card"
        size="small"
        text
        severity="secondary"
        :aria-label="$t('typeDeclaration.identifier')"
        :title="$t('typeDeclaration.identifier')"
        @click="authoring.toggleIdentifier(field.node)"
      />
      <Button
        icon="pi pi-arrow-up"
        size="small"
        text
        severity="secondary"
        :disabled="!canMove(-1)"
        :aria-label="$t('typeDeclaration.moveUp')"
        :title="$t('typeDeclaration.moveUp')"
        @click="authoring.moveField(field.node, -1)"
      />
      <Button
        icon="pi pi-arrow-down"
        size="small"
        text
        severity="secondary"
        :disabled="!canMove(1)"
        :aria-label="$t('typeDeclaration.moveDown')"
        :title="$t('typeDeclaration.moveDown')"
        @click="authoring.moveField(field.node, 1)"
      />
      <Button
        icon="pi pi-trash"
        size="small"
        text
        severity="danger"
        class="ml-auto"
        :aria-label="$t('common.delete')"
        :title="$t('common.delete')"
        data-testid="field-author-remove"
        @click="authoring.removeWithGate(field.node.id)"
      />
    </div>
    <Message v-for="item in authoring.refusals.value" :key="item" severity="warn" :closable="false">{{ item }}</Message>
    <Message v-for="item in authoring.diagnostics.value" :key="item" severity="error" :closable="false">{{ item }}</Message>
    <div v-if="authoring.dirty.value || authoring.saving.value" class="flex items-center justify-between gap-2">
      <span class="text-supporting text-muted">{{ $t('common.unsavedChanges') }}</span>
      <DeclarationSaveButton :authoring="authoring" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
import DeclarationSaveButton from '~/components/type-designer/DeclarationSaveButton.vue';

// The field authoring form (SPEC §1): the shared DescriptorEditor beside
// the name, the identifier move, reorder, and the diagnostics-gated
// removal — every mutation a gesture on the provided session.
const props = defineProps({
  authoring: { type: Object, required: true },
  field: { type: Object, required: true },
  typeOptions: { type: Array, default: () => [] }
});

const fieldIndex = computed(() => (props.authoring.subtree?.value?.fields || [])
  .findIndex(entry => entry.node.id === props.field.node.id));

function canMove(offset) {
  const next = fieldIndex.value + offset;
  return next >= 0 && next < (props.authoring.subtree?.value?.fields || []).length;
}
</script>
