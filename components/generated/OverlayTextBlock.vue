<template>
  <!-- The overlay's text block (SPEC §26): reads through the one markdown
       composition, authors inline through the one engine mount; the text
       saves with the overlay's document. -->
  <div v-if="editing" class="flex flex-col gap-2">
    <div class="flex items-center justify-end">
      <Button
        icon="pi pi-check"
        size="small"
        text
        rounded
        severity="secondary"
        :aria-label="t('common.apply')"
        :title="t('common.apply')"
        @click="session.closeEditor()"
      />
    </div>
    <CrepeEditor
      :default-value="block.text"
      class="min-h-24"
      @update="text => session.updateText(block.id, text)"
    />
  </div>
  <MarkdownBlocks v-else :source="block.text" />
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import CrepeEditor from './CrepeEditor.vue';
import MarkdownBlocks from './MarkdownBlocks.vue';

const props = defineProps({
  block: { type: Object, required: true },
  // The overlay session; a reader mounts the block with no session and
  // no authoring.
  session: { type: Object, default: null }
});

const { t } = useI18n();
const editing = computed(() => Boolean(props.session && props.session.editingBlockId === props.block.id));
</script>
