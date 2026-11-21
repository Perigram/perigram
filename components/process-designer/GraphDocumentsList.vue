<template>
  <div class="mt-3 flex flex-col gap-1.5" data-graph-documents>
    <div class="flex items-center justify-between gap-2">
      <span class="text-label">{{ $t('processDesigner.graphDocuments') }}</span>
      <Button
        icon="pi pi-plus"
        size="small"
        text
        severity="secondary"
        :aria-label="$t('processDesigner.newGraphDocument')"
        @click="emit('create')"
      />
    </div>
    <div v-if="loading" class="text-supporting text-muted">…</div>
    <Message v-else-if="error" severity="error">{{ error }}</Message>
    <div
      v-for="doc in documents"
      v-else
      :key="String(doc._id)"
      class="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-ui px-2 py-1.5"
      :class="String(activeId || '') === String(doc._id) ? 'bg-subtle' : 'hover:bg-subtle'"
      @click="emit('open', doc)"
    >
      <template v-if="String(renamingId || '') === String(doc._id)">
        <InputText
          :model-value="renamingName"
          class="min-w-0 flex-1"
          size="small"
          :aria-label="$t('common.rename')"
          @update:model-value="value => emit('rename-input', value)"
          @click.stop
          @keydown.enter.prevent.stop="emit('rename-apply', doc)"
        />
        <Button
          icon="pi pi-check"
          class="shrink-0"
          size="small"
          text
          :disabled="!String(renamingName || '').trim()"
          @click.stop="emit('rename-apply', doc)"
        />
      </template>
      <template v-else>
        <span class="min-w-0 flex-1 truncate" :title="doc.name">{{ doc.name }}</span>
        <span
          v-if="String(activeId || '') === String(doc._id) && dirty"
          class="h-2 w-2 shrink-0 rounded-full bg-primary"
          :title="$t('common.unsavedChanges')"
          aria-hidden="true"
        />
        <span
          v-if="String(activeId || '') === String(doc._id) && saving"
          class="pi pi-spin pi-spinner shrink-0 text-muted"
          aria-hidden="true"
        />
        <Button
          v-if="String(activeId || '') === String(doc._id)"
          icon="pi pi-times"
          class="shrink-0"
          size="small"
          text
          severity="secondary"
          :aria-label="$t('processDesigner.closeGraphDocument')"
          @click.stop="emit('close')"
        />
        <Button
          icon="pi pi-pencil"
          class="shrink-0"
          size="small"
          text
          severity="secondary"
          :aria-label="$t('common.rename')"
          @click.stop="emit('rename-start', doc)"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';

defineProps({
  documents: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  activeId: { type: String, default: '' },
  dirty: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  renamingId: { type: String, default: '' },
  renamingName: { type: String, default: '' }
});
const emit = defineEmits(['open', 'create', 'close', 'rename-start', 'rename-input', 'rename-apply']);
</script>
