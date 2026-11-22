<template>
  <span class="inline-flex">
    <button
      type="button"
      class="ck-block-control"
      :aria-label="t('uiMapping.addBlock')"
      :title="t('uiMapping.addBlock')"
      :disabled="!session.loaded"
      @click="event => menu?.toggle(event)"
    >
      <i class="pi pi-plus" aria-hidden="true" />
    </button>
    <Popover ref="menu">
      <div class="flex w-52 flex-col gap-1 p-1">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="flex w-full items-center gap-2 rounded-ui px-2 py-1 text-left text-body hover:bg-chrome-subtle"
          @click="pick(item)"
        >
          <i v-if="item.glyph" :class="['w-5 flex-none text-center', item.glyph]" aria-hidden="true" />
          <span v-else class="w-5 flex-none text-center text-supporting" aria-hidden="true">{{ item.glyphText }}</span>
          <span class="min-w-0 truncate">{{ t(item.labelKey) }}</span>
        </button>
      </div>
    </Popover>
  </span>
</template>

<script setup>
// The document gutter's insert menu: the same block vocabulary the slash
// panel offers. Text entries insert a text block opened at that block
// kind; the picker entries (view, reference, graph result) hand off to
// the page session's pickers.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Popover from 'primevue/popover';
import { BLOCK_VOCABULARY } from '#workers/documents/surfaces/lib/block-vocabulary-data.mjs';

const props = defineProps({
  session: { type: Object, required: true },
  // The flow index the new block takes.
  at: { type: Number, default: 0 }
});

const { t } = useI18n();
const menu = ref();
const items = computed(() => BLOCK_VOCABULARY.filter(item => item.insertable));

function pick(item) {
  menu.value?.hide();
  if (item.id === 'view') props.session.openViewPicker(props.at);
  else if (item.id === 'reference') props.session.openReferencePicker(props.at);
  else if (item.id === 'graph-output') props.session.openGraphOutputPicker(props.at);
  else props.session.insertText(props.at, item.id);
}
</script>
