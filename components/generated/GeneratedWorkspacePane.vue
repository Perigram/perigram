<template>
  <GeneratedEntityFile
    v-if="item?.kind === 'entity'"
    :item="item"
    :action-entries="actionEntries"
    :closeable="closeable"
    :splittable="splittable"
    :show-generated-actions="item.type !== 'project'"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-page="page => $emit('open-page', page)"
    @refresh="$emit('refresh')"
    @split="orientation => $emit('split', orientation)"
    @close="$emit('close')"
  />
  <GeneratedWorkspacePage
    v-else-if="item?.kind === 'page'"
    :page="item"
    :closeable="closeable"
    :splittable="splittable"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-page="page => $emit('open-page', page)"
    @refresh="$emit('refresh')"
    @split="orientation => $emit('split', orientation)"
    @close="$emit('close')"
  />
  <section
    v-else
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-content"
    data-empty-workspace-pane
  >
    <header class="flex h-10 shrink-0 items-center justify-end gap-2 border-b [border-color:var(--ck-chrome-border)] bg-chrome px-2 text-[var(--ck-chrome-foreground)]">
      <Button
        v-if="splittable"
        icon="pi pi-arrows-h"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('project.splitRight')"
        @click="$emit('split', 'horizontal')"
      />
      <Button
        v-if="splittable"
        icon="pi pi-arrows-v"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('project.splitDown')"
        @click="$emit('split', 'vertical')"
      />
      <Button
        v-if="closeable"
        icon="pi pi-times"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('common.close')"
        @click="$emit('close')"
      />
    </header>
    <div class="min-h-0 flex-1" />
  </section>
</template>

<script setup>
import Button from 'primevue/button';
import GeneratedEntityFile from '~/components/generated/GeneratedEntityFile.vue';
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';

defineProps({
  item: { type: Object, default: null },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

defineEmits(['execute-action', 'open-page', 'refresh', 'split', 'close']);
</script>
