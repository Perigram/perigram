<template>
  <div v-if="session?.writable" class="ck-doc-tail relative min-h-8">
    <CrepeEditor
      :key="editorKey"
      ref="editor"
      class="ck-inline-editor"
      :default-value="draft"
      :placeholder="t('editors.slashHint')"
      split-on-enter
      @ready="focusIfRequested"
      @update="text => (draft = text)"
      @enter="commit(true)"
    />
  </div>
</template>

<script setup>
// The document's trailing authoring line (SPEC §26): a real inline engine
// mount at the bottom, empty and type-ready. Committing its text appends
// a text block and leaves a fresh empty line.
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
const focusAfterCommit = ref(false);

function commit(focusNext = false) {
  const text = draft.value.trim();
  if (text) {
    props.session.appendTextBlock?.(draft.value);
    draft.value = '';
    editorKey.value += 1;
    focusAfterCommit.value = focusNext;
    nextTick(focusIfRequested);
    return;
  }
  if (focusNext) {
    focusAfterCommit.value = true;
    nextTick(focusIfRequested);
  }
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
