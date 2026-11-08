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
      split-on-enter
      @ready="onEditorReady"
      @update="text => session.updateText(block.id, text)"
      @enter="insertAfter"
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
const pendingPoint = ref(null);
const editing = computed(() => Boolean(props.session && props.session.editingBlockId === props.block.id));
const initialBlock = computed(() => (props.session?.initialBlockFor?.(props.block.id) || ''));

function startEditing(event) {
  if (!props.session || !props.session.writable || editing.value) return;
  if (event.target?.closest?.('a')) return;
  pendingPoint.value = { x: event.clientX, y: event.clientY };
  props.session.editBlock(props.block.id);
}

function onEditorReady() {
  nextTick(() => {
    editor.value?.focus?.(pendingPoint.value);
    pendingPoint.value = null;
    root.value?.scrollIntoView?.({ block: 'nearest' });
  });
}

function insertAfter() {
  props.session?.insertTextAfter?.(props.block.id);
}

function closeEditor() {
  props.session?.closeEditor?.();
}
</script>
