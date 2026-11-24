<template>
  <div v-if="session?.writable && session.collabReady !== false && !session.editingBlockId && !session.activeBlockId" class="ck-doc-tail min-h-6">
    <CrepeEditor
      v-if="activated"
      :key="editorKey"
      ref="editor"
      class="ck-inline-editor"
      :default-value="draft"
      :placeholder="t('editors.slashHint')"
      :scroll="false"
      commit-on-enter
      delete-on-empty-backspace
      @ready="focusIfRequested"
      @update="text => (draft = text)"
      @enter="commit(true)"
      @delete-empty="resumePrevious"
      @request-view="requestView"
      @request-reference="requestReference"
      @request-graph-output="requestGraphOutput"
      @request-file-reference="requestFileReference"
    />
    <!-- The idle line is the placeholder alone, rendered as plain document
         text exactly where the engine's own placeholder sits: the engine
         mounts from the first focus. The prose role rides the inner span —
         the button element has no font of its own. -->
    <button
      v-else
      type="button"
      class="w-full cursor-text text-left"
      @click="activate"
      @focus="activate"
    >
      <span class="text-prose text-muted">{{ t('editors.slashHint') }}</span>
    </button>
  </div>
</template>

<script setup>
// The document's trailing authoring line (SPEC §26): always mounted at
// the page bottom while no block editor holds focus. Idle it is the
// placeholder; the engine mounts from the first activation, and
// committing its text appends a text block and leaves a fresh line.
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import CrepeEditor from './CrepeEditor.vue';

const props = defineProps({
  session: { type: Object, required: true }
});

const { t } = useI18n();
const editor = ref(null);
const draft = ref('');
const editorKey = ref(0);
const activated = ref(false);
const focusAfterCommit = ref(false);

function activate() {
  if (activated.value) return;
  activated.value = true;
  focusAfterCommit.value = true;
}

function commit(focusNext = false) {
  const text = draft.value.trim();
  if (text) {
    props.session.appendTextBlock?.(draft.value);
    draft.value = '';
    editorKey.value += 1;
    // The remounted engine takes the focus on ready; focusing now would
    // land on the host the remount is replacing.
    focusAfterCommit.value = focusNext;
    return;
  }
  if (focusNext) {
    focusAfterCommit.value = true;
    nextTick(focusIfRequested);
  }
}

function resumePrevious() {
  props.session.resumeLastTextBlock?.();
}

function requestView() {
  props.session.openViewPickerAtEnd?.();
}

function requestReference() {
  props.session.openReferencePickerAtEnd?.();
}

function requestGraphOutput() {
  props.session.openGraphOutputPickerAtEnd?.();
}

function requestFileReference(ref) {
  props.session.insertReferenceAtEnd?.(ref);
}

function focusIfRequested() {
  if (!focusAfterCommit.value) return;
  focusAfterCommit.value = false;
  editor.value?.focus?.();
}

onBeforeUnmount(() => {
  if (draft.value.trim()) props.session.appendTextBlock?.(draft.value);
});
</script>
