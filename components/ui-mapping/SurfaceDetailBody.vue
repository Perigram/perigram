<template>
  <div class="flex flex-col gap-4">
    <PreviewBox v-if="hasPreview" :type="type" :payload="instance.payload" />
    <div class="grid grid-cols-1 items-start gap-x-4 gap-y-3 md:grid-cols-2">
      <div
        v-for="field in fields"
        :key="field.name"
        class="flex min-w-0 flex-col gap-1"
        :class="spanFor(field.descriptor)"
      >
        <span class="text-label">{{ field.name }}</span>
        <FieldControl
          :model-value="instance.fields?.[field.name]"
          :descriptor="field.descriptor"
          variant="row"
          :pool="pool"
          :bundle="bundle"
        />
      </div>
    </div>
    <div v-for="relation in relationViews" :key="relation.key" :class="relationClass(relation)">
      <EntityChip v-for="ref in relation.shown" :key="ref.id" :value="ref" :pool="pool" :bundle="bundle" />
      <Tag v-if="relation.overflow === 'count' && relation.hidden > 0" :value="`+${relation.hidden}`" severity="contrast" />
      <Button
        v-if="(relation.overflow === 'more' && relation.hidden > 0) || relation.expanded"
        :label="relation.expanded ? $t('uiMapping.showLess') : $t('uiMapping.showMore', { count: relation.hidden })"
        size="small"
        text
        @click="$emit('toggle', relation.key)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import { resolveSurface, applyBudget } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import EntityChip from './EntityChip.vue';
import PreviewBox from './PreviewBox.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  type: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  expanded: { type: Object, default: () => ({}) }
});

defineEmits(['toggle']);

const surface = computed(() => resolveSurface(props.type, { variant: props.variant }));
const hasPreview = computed(() => surface.value.slots.includes('preview'));
const fields = computed(() => Object.entries(props.type.fields || {}).map(([name, descriptor]) => ({ name, descriptor })));
const spanFor = descriptor => (descriptor.base === 'record' || descriptor.base === 'list' || descriptor.base === 'map' || descriptor.base === 'json' ? 'md:col-span-2' : '');

const relationViews = computed(() => {
  if (!surface.value.slots.includes('relations')) return [];
  return Object.entries(props.instance.relations || {}).map(([key, refs]) => {
    const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
    const budget = surface.value.budgets[key];
    const outcome = applyBudget(list, budget);
    const isOpen = budget?.overflow === 'more' && props.expanded[key];
    return {
      key,
      overflow: budget?.overflow || 'all',
      shown: isOpen ? list : outcome.visible,
      hidden: outcome.hidden,
      mode: outcome.mode,
      expanded: Boolean(isOpen)
    };
  });
});
const relationClass = relation => (relation.mode === 'scroll'
  ? 'flex max-h-48 flex-wrap gap-2 overflow-y-auto'
  : 'flex flex-wrap items-center gap-2');
</script>
