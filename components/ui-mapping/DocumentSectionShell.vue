<template>
  <div v-if="session" :class="spacing.stack" class="group/ck-doc-section relative">
    <div
      class="absolute -left-14 top-1 z-10 flex w-14 items-center justify-end gap-1 pr-1 opacity-0 transition-opacity group-hover/ck-doc-section:opacity-100 focus-within:opacity-100"
    >
      <OverlayInsertControl :session="session" :at="index + 1" />
      <button
        type="button"
        class="ck-block-control cursor-grab active:cursor-grabbing"
        draggable="true"
        :aria-label="t('uiMapping.sectionActions')"
        :title="t('uiMapping.sectionActions')"
        @click="event => menu?.toggle(event)"
        @dragstart="dragStart"
        @dragend="session.endDrag?.()"
        @keydown.up.prevent="session.move(sectionKey, -1)"
        @keydown.down.prevent="session.move(sectionKey, 1)"
      >
        <svg viewBox="0 0 16 16" class="h-4 w-4" fill="currentColor" aria-hidden="true">
          <circle cx="5.5" cy="3.5" r="1.15" />
          <circle cx="10.5" cy="3.5" r="1.15" />
          <circle cx="5.5" cy="8" r="1.15" />
          <circle cx="10.5" cy="8" r="1.15" />
          <circle cx="5.5" cy="12.5" r="1.15" />
          <circle cx="10.5" cy="12.5" r="1.15" />
        </svg>
      </button>
    </div>
    <Menu ref="menu" :model="items" popup />
    <div
      class="relative"
      @dragover.prevent="over"
      @dragleave="dropTarget = false"
      @drop.prevent="drop"
    >
      <div
        v-if="dropTarget"
        class="absolute inset-x-0 -top-1.5 h-0.5 rounded-full bg-primary"
        aria-hidden="true"
      />
      <slot />
    </div>
  </div>
  <slot v-else />
</template>

<script setup>
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
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
