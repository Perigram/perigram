<template>
  <div
    ref="root"
    :class="session?.writable ? 'cursor-text' : ''"
    @focusin="session?.activateBlock?.(block.id)"
    @focusout="onFocusOut"
    @keydown.esc.stop.prevent="closeEditor"
    @keydown.meta.enter.stop.prevent="closeEditor"
    @keydown.ctrl.enter.stop.prevent="closeEditor"
  >
    <CrepeEditor
      v-if="session?.writable && mounted && collabReady && session.collabReady !== false"
      ref="editor"
      class="ck-inline-editor"
      :default-value="block.text"
      :initial-block="initialBlock"
      :placeholder="placeholder"
      :collab="collab"
      :scroll="false"
      split-on-enter
      delete-on-empty-backspace
      @ready="onEditorReady"
      @update="text => session.updateText(block.id, text)"
      @split="splitBlock"
      @merge-backward="mergeBackward"
      @merge-forward="mergeForward"
      @delete-empty="deleteBlock"
      @caret-boundary="moveCaret"
      @request-view="requestView"
      @request-reference="requestReference"
      @request-graph-output="requestGraphOutput"
      @request-file-reference="requestFileReference"
    />
    <MarkdownBlocks v-else-if="block.text" :source="block.text" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CrepeEditor from './CrepeEditor.vue';
import MarkdownBlocks from './MarkdownBlocks.vue';

const props = defineProps({
  block: { type: Object, required: true },
  // Only the final empty text block carries the slash hint.
  placeholder: { type: String, default: '' },
  // The overlay session; a reader mounts the block with no session and
  // no authoring.
  session: { type: Object, default: null }
});

const root = ref(null);
const editor = ref(null);
// The Crepe engine mounts only in a browser; the server render shows the
// markdown read face until hydration.
const mounted = ref(false);
const collab = props.session?.openTextCollab?.(props.block.id) || null;
const collabReady = ref(!collab);
const initialBlock = computed(() => (props.session?.initialBlockFor?.(props.block.id) || ''));
const editorApi = {
  getMarkdown: () => editor.value?.getMarkdown?.() ?? props.block.text,
  appendMarkdown: markdown => editor.value?.appendMarkdown?.(markdown)
};

onMounted(async () => {
  props.session?.registerTextEditor?.(props.block.id, editorApi);
  mounted.value = true;
  if (collab) {
    await collab.ready;
    collabReady.value = true;
  }
});
onBeforeUnmount(() => {
  props.session?.unregisterTextEditor?.(props.block.id);
});

function focusEditor() {
  nextTick(() => {
    if (props.session?.caretFor?.(props.block.id) === 'end') editor.value?.focusEnd?.();
    else editor.value?.focusStart?.();
    root.value?.scrollIntoView?.({ block: 'nearest' });
  });
}

function onEditorReady() {
  if (props.session?.editingBlockId !== props.block.id) return;
  focusEditor();
}

watch(
  () => props.session?.editingBlockId,
  id => { if (id === props.block.id) focusEditor(); }
);

function onFocusOut(event) {
  if (root.value?.contains?.(event.relatedTarget)) return;
  if (props.session?.releaseFocus) props.session.releaseFocus(props.block.id);
  else props.session?.deactivateBlock?.(props.block.id);
}

function splitBlock(after) {
  props.session?.splitBlock?.(props.block.id, after);
}

function mergeBackward() {
  props.session?.mergeWithPrevious?.(props.block.id);
}

function mergeForward() {
  props.session?.mergeNext?.(props.block.id);
}

function moveCaret(direction) {
  props.session?.moveCaret?.(props.block.id, direction);
}

function deleteBlock() {
  props.session?.removeEmptyBlock?.(props.block.id);
}

function requestView() {
  props.session?.openViewPickerAfter?.(props.block.id);
}

function requestReference() {
  props.session?.openReferencePickerAfter?.(props.block.id);
}

function requestGraphOutput() {
  props.session?.openGraphOutputPickerAfter?.(props.block.id);
}

function requestFileReference(ref) {
  props.session?.insertReferenceAfter?.(props.block.id, ref);
}

function closeEditor() {
  props.session?.closeEditor?.();
  props.session?.deactivateBlock?.(props.block.id);
  root.value?.querySelector?.('.ProseMirror')?.blur?.();
}
</script>
