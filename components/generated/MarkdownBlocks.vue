<template>
  <div ref="root" class="contents">
    <template v-for="(block, index) in blocks" :key="index">
      <div v-if="block.type === 'markdown'" class="ck-markdown-body" v-html="renderedOf(block)" />
      <ViewEmbed
        v-else
        :view-id="block.id || ''"
        :type-id="block.typeId || ''"
        :fallback-name="block.name"
      />
    </template>
    <Teleport
      v-for="item in instanceRefs"
      :key="item.slot"
      :to="item.el"
    >
      <InstanceInlineRef :type="item.type" :id="item.id" />
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
import ViewEmbed from './ViewEmbed.vue';

const props = defineProps({
  source: { type: String, default: '' }
});

const root = ref(null);
const instanceRefs = ref([]);
const blocks = computed(() => splitViewEmbeds(props.source));
const renderedOf = block => renderMarkdown(block.text);

function registerInstanceRefs() {
  const nodes = root.value?.querySelectorAll?.('[data-instance-type][data-instance-id]') || [];
  instanceRefs.value = [...nodes].map((node, index) => ({
    el: node,
    type: node.dataset.instanceType,
    id: node.dataset.instanceId,
    slot: `${index}:${node.dataset.instanceType}:${node.dataset.instanceId}`
  }));
}

onMounted(registerInstanceRefs);
watch(() => props.source, () => {
  instanceRefs.value = [];
  nextTick(registerInstanceRefs);
});
</script>
