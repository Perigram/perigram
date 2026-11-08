<template>
  <!-- With a session the section carries its authoring affordances in the
       document's left gutter lane — drag handle, insert below, and one
       overflow (move, and edit/delete for custom blocks) — revealed on
       hover or focus. Without a session the shell adds nothing. -->
  <div v-if="session" :class="spacing.stack" class="group/ck-doc-section relative pl-6">
    <div
      class="absolute top-0 left-0 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/ck-doc-section:opacity-100 focus-within:opacity-100"
    >
      <button
        type="button"
        class="flex h-6 w-6 cursor-grab items-center justify-center rounded-ui text-muted hover:text-body active:cursor-grabbing"
        draggable="true"
        :aria-label="t('uiMapping.moveSection')"
        :title="t('uiMapping.moveSection')"
        @dragstart="dragStart"
        @keydown.up.prevent="session.move(sectionKey, -1)"
        @keydown.down.prevent="session.move(sectionKey, 1)"
      >
        <i class="pi pi-bars" aria-hidden="true" />
      </button>
      <OverlayInsertControl :session="session" :at="index + 1" />
      <Button
        icon="pi pi-ellipsis-v"
        text
        rounded
        size="small"
        severity="secondary"
        class="h-6 w-6"
        :aria-label="t('uiMapping.sectionActions')"
        :title="t('uiMapping.sectionActions')"
        @click="event => menu?.toggle(event)"
      />
    </div>
    <Menu ref="menu" :model="items" popup />
    <div
      class="rounded-ui transition-shadow"
      :class="dropTarget ? 'border-t-2 border-primary' : 'border-t-2 border-transparent'"
      @dragover.prevent="over"
      @dragleave="dropTarget = false"
      @drop.prevent="drop"
    >
      <slot />
    </div>
  </div>
  <slot v-else />
</template>

<script setup>
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import OverlayInsertControl from './OverlayInsertControl.vue';

const props = defineProps({
  // The overlay session (composables/useRecordOverlay); null renders the
  // bare section.
  session: { type: Object, default: null },
  sectionKey: { type: String, required: true },
  index: { type: Number, default: 0 },
  block: { type: Object, default: null }
});

const spacing = inject('uiMappingSpacing');
const { t } = useI18n();
const menu = ref();
const dropTarget = ref(false);

const items = computed(() => {
  const entries = [
    { label: t('uiMapping.moveSectionUp'), icon: 'pi pi-arrow-up', command: () => props.session.move(props.sectionKey, -1) },
    { label: t('uiMapping.moveSectionDown'), icon: 'pi pi-arrow-down', command: () => props.session.move(props.sectionKey, 1) }
  ];
  if (props.block) {
    entries.push(
      { separator: true },
      { label: t('common.delete'), icon: 'pi pi-trash', command: () => props.session.removeBlock(props.block.id) }
    );
  }
  return entries;
});

function dragStart(event) {
  props.session.beginDrag?.(props.sectionKey);
  event.dataTransfer?.setData('text/plain', props.sectionKey);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function over() {
  dropTarget.value = Boolean(props.session.dragKey && props.session.dragKey !== props.sectionKey);
}

function drop() {
  dropTarget.value = false;
  const key = props.session.dragKey;
  props.session.endDrag?.();
  if (!key || key === props.sectionKey) return;
  props.session.moveToIndex(key, props.index);
}
</script>
