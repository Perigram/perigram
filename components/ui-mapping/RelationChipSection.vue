<template>
  <section :class="spacing.stackTight">
    <span :class="LAYOUT.sectionTitle">{{ relation.label }}</span>
    <div :class="LAYOUT.row">
      <InstanceInlineRef
        v-for="ref in relation.shown"
        :key="ref.id"
        :type="String(ref?.typeId || '')"
        :id="ref?.id"
        :entity="pool?.[ref?.typeId]?.[ref?.id] || ref?.entity || null"
        :context-action-entries="inlineRefEntries(ref)"
      />
      <Tag v-if="relation.overflow === 'count' && relation.hidden > 0" :value="`+${relation.hidden}`" severity="contrast" />
      <Button
        v-if="(relation.overflow === 'more' && relation.hidden > 0) || relation.expanded"
        :label="relation.expanded ? t('uiMapping.showLess') : t('uiMapping.showMore', { count: relation.hidden })"
        size="small"
        text
        @click="emit('toggle', relation.key)"
      />
    </div>
  </section>
</template>

<script setup>
// One relation's chip section (SPEC §22.17): the budgeted reference row
// with its show-more control, rendered inline on the record document and
// inside the fill-grammar body alike.
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import { LAYOUT, resolveActionButton } from '#shared/ui-mapping/index.js';
import InstanceInlineRef from '../shared/InstanceInlineRef.vue';

const props = defineProps({
  // A relationViews entry (SurfaceDetailBody's derivation).
  relation: { type: Object, required: true },
  instance: { type: Object, required: true },
  actions: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['toggle']);
const spacing = inject('uiMappingSpacing');
const { t } = useI18n();

// Inline-resolved actions (relation unlink) address the reference the
// chip renders: entries bind the owner record and the relation payload
// the run channel expects.
const inlineActionsByKey = computed(() => {
  const byKey = new Map();
  for (const action of props.actions) {
    if (resolveActionButton(action).inline !== true) continue;
    const key = action.relation?.key;
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(action);
  }
  return byKey;
});

function inlineRefEntries(ref = {}) {
  if (ref?.id === null || ref?.id === undefined) return [];
  return (inlineActionsByKey.value.get(props.relation.key) || [])
    .filter((action) => {
      const targetTypes = action.relation?.targetTypes || [];
      return ref.typeId ? targetTypes.includes(ref.typeId) : targetTypes.length === 1;
    })
    .map(action => ({
      action,
      entity: props.instance,
      context: { data: { relations: { [props.relation.key]: { type: ref.typeId, id: ref.id } } } }
    }));
}
</script>
