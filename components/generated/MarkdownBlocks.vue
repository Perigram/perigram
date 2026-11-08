<template>
  <div ref="root" class="contents">
    <template v-for="(block, index) in blocks" :key="index">
      <div v-if="block.type === 'markdown'" class="ck-markdown-body" v-html="renderedOf(block)" />
      <div v-else class="ck-document-embed">
        <ViewEmbed
          :view-id="block.id || ''"
          :type-id="block.typeId || ''"
          :fallback-name="block.name"
        />
      </div>
    </template>
    <Teleport
      v-for="item in instanceRefs"
      :key="item.slot"
      :to="item.el"
    >
      <InstanceInlineRef :type="item.type" :id="item.id" />
    </Teleport>
    <Teleport
      v-for="item in fileRefs"
      :key="item.slot"
      :to="item.el"
    >
      <FileChip :file="item.file" @open="openFile(item.file)" />
    </Teleport>
  </div>
</template>

<script setup>
// The read presentation of authored markdown (SPEC §26): the one
// pipeline renders the prose, live view embeds compose the view fences,
// and inline instance links mount the shared instance chip.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { renderMarkdown, splitViewEmbeds } from '#shared/markdown.js';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import FileChip from '~/components/shared/FileChip.vue';
import ViewEmbed from './ViewEmbed.vue';
import { fileRefDescriptor } from '~/utils/file-refs.js';

const props = defineProps({
  source: { type: String, default: '' }
});

const root = ref(null);
const instanceRefs = ref([]);
const fileRefs = ref([]);
const blocks = computed(() => splitViewEmbeds(props.source));
const renderedOf = block => renderMarkdown(block.text);

function registerRefs() {
  const instanceNodes = root.value?.querySelectorAll?.('[data-instance-type][data-instance-id]') || [];
  instanceRefs.value = [...instanceNodes].map((node, index) => ({
    el: node,
    type: node.dataset.instanceType,
    id: node.dataset.instanceId,
    slot: `${index}:${node.dataset.instanceType}:${node.dataset.instanceId}`
  }));
  const fileNodes = root.value?.querySelectorAll?.('[data-file-href]') || [];
  fileRefs.value = [...fileNodes].map((node, index) => {
    const href = node.dataset.fileHref;
    return {
      el: node,
      slot: `${index}:${href}`,
      file: fileRefDescriptor({ href, name: node.textContent?.trim() || '' })
    };
  });
}

function openFile(file) {
  if (file?.url && typeof window !== 'undefined') window.open(file.url, '_blank', 'noopener');
}

onMounted(registerRefs);
watch(() => props.source, () => {
  instanceRefs.value = [];
  fileRefs.value = [];
  nextTick(registerRefs);
});
</script>
