<template>
  <!-- The overlay's text block (SPEC §26): continuous document content —
       read through the one markdown composition, authored inline through
       the one engine mount. Clicking the text opens the editor at the
       caret; Escape or Cmd/Ctrl+Enter closes it. -->
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
      class="ck-inline-editor min-h-16"
      :default-value="block.text"
      @ready="focusEditor"
      @update="text => session.updateText(block.id, text)"
    />
    <MarkdownBlocks v-else :source="block.text" />
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
const editing = computed(() => Boolean(props.session && props.session.editingBlockId === props.block.id));

function startEditing() {
  if (!props.session || !props.session.writable || editing.value) return;
  props.session.editBlock(props.block.id);
}

function focusEditor() {
  nextTick(() => {
    editor.value?.focus?.();
    root.value?.scrollIntoView?.({ block: 'nearest' });
  });
}

function closeEditor() {
  props.session?.closeEditor?.();
}
</script>
