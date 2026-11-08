<template>
  <div
    ref="root"
    :class="session ? 'cursor-text' : ''"
    @click="startEditing"
    @keydown.esc.stop.prevent="closeEditor"
    @keydown.meta.enter.stop.prevent="closeEditor"
    @keydown.ctrl.enter.stop.prevent="closeEditor"
  >
    <CrepeEditor
      v-if="editing"
      ref="editor"
      class="ck-inline-editor"
      :default-value="block.text"
      :initial-block="initialBlock"
      :initial-point="pendingPoint"
      @ready="focusEditor"
      @update="text => session.updateText(block.id, text)"
    />
    <template v-else>
      <MarkdownBlocks v-if="block.text" :source="block.text" />
      <span v-else-if="session?.writable" class="block py-1 text-muted text-supporting">{{ t('editors.slashHint') }}</span>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import CrepeEditor from './CrepeEditor.vue';
import MarkdownBlocks from './MarkdownBlocks.vue';

const props = defineProps({
  block: { type: Object, required: true },
  // The overlay session; a reader mounts the block with no session and
  // no authoring.
  session: { type: Object, default: null }
});

const { t } = useI18n();
const root = ref(null);
const editor = ref(null);
const pendingPoint = ref(null);
const editing = computed(() => Boolean(props.session && props.session.editingBlockId === props.block.id));
const initialBlock = computed(() => (props.session?.initialBlockFor?.(props.block.id) || ''));

function startEditing(event) {
  if (!props.session || !props.session.writable || editing.value) return;
  if (event.target?.closest?.('a')) return;
  pendingPoint.value = { x: event.clientX, y: event.clientY };
  props.session.editBlock(props.block.id);
}

function focusEditor() {
  nextTick(() => {
    editor.value?.focus?.(pendingPoint.value);
    pendingPoint.value = null;
    root.value?.scrollIntoView?.({ block: 'nearest' });
  });
}

function closeEditor() {
  props.session?.closeEditor?.();
}
</script>
