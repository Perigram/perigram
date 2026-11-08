<template>
  <div
    ref="root"
    :class="session?.writable ? 'cursor-text' : ''"
    @keydown.esc.stop.prevent="closeEditor"
    @keydown.meta.enter.stop.prevent="closeEditor"
    @keydown.ctrl.enter.stop.prevent="closeEditor"
  >
    <CrepeEditor
      v-if="session?.writable"
      ref="editor"
      class="ck-inline-editor"
      :default-value="block.text"
      :initial-block="initialBlock"
      split-on-enter
      delete-on-empty-backspace
      @ready="onEditorReady"
      @update="text => session.updateText(block.id, text)"
      @enter="insertAfter"
      @delete-empty="deleteBlock"
    />
    <MarkdownBlocks v-else-if="block.text" :source="block.text" />
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import CrepeEditor from './CrepeEditor.vue';
import MarkdownBlocks from './MarkdownBlocks.vue';

const props = defineProps({
  block: { type: Object, required: true },
  // The overlay session; a reader mounts the block with no session and
  // no authoring.
  session: { type: Object, default: null }
});

const root = ref(null);
const editor = ref(null);
const initialBlock = computed(() => (props.session?.initialBlockFor?.(props.block.id) || ''));

function onEditorReady() {
  if (props.session?.editingBlockId !== props.block.id) return;
  nextTick(() => {
    editor.value?.focus?.();
    root.value?.scrollIntoView?.({ block: 'nearest' });
  });
}

function insertAfter() {
  props.session?.insertTextAfter?.(props.block.id);
}

function deleteBlock() {
  props.session?.removeEmptyBlock?.(props.block.id);
}

function closeEditor() {
  props.session?.closeEditor?.();
}
</script>
