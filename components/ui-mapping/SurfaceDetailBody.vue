<template>
  <div v-if="d" :class="d.stack">
    <div v-if="hasPreview" :class="LAYOUT.previewHero">
      <div :class="heroBand">
        <PreviewBox fill :type="type" :instance="instance" :payload="instance.payload" :preview-source="instance.previewSource" />
      </div>
    </div>

    <!-- The record body fills its surface (SPEC §Generative UI,
         2026-10-22): content blocks — field groups, relation chip rows —
         share a container-derived column grid; rich structural blocks
         span the full row. Fact rows flow into their own finer grid
         inside each group. -->
    <div :class="LAYOUT.bodyGrid">
      <section
        v-for="group in groups"
        :key="group.id"
        :class="d.stackTight"
      >
        <span v-if="showGroupTitles && group.label" :class="d.sectionTitle">{{ group.label }}</span>
        <div v-if="shownFacts(group).length" :class="variant === 'full' ? LAYOUT.factsGrid : LAYOUT.specList">
          <div v-for="field in shownFacts(group)" :key="field.name" :class="d.specRow">
            <span :class="LAYOUT.labelCell">{{ field.label }}</span>
            <div :class="LAYOUT.factCell">
              <InlineField
                :field="field"
                :editable="editable"
                :quantitative="quantitative"
                :pool="pool"
                :bundle="bundle"
                @inline-change="change => emit('inline-change', change)"
              />
            </div>
          </div>
          <div v-if="hiddenFactCount(group) > 0" class="py-1">
            <Button
              :label="factGroupExpanded(group)
                ? $t('uiMapping.showLess')
                : $t('uiMapping.showMore', { count: hiddenFactCount(group) })"
              size="small"
              text
              @click="toggleFacts(group)"
            />
          </div>
        </div>
        <!-- Structural fields follow the section grammar of everything else
             on the record page: a labeled open block per field, rendered in
             the open. -->
        <template v-for="field in structuralOf(group)" :key="field.name">
          <div v-if="isRichStructure(field)" :class="LAYOUT.labeledBlock">
            <span :class="LAYOUT.sectionTitle">{{ field.label }}</span>
            <StructuralFieldPanel
              :field="field"
              :editable="editable"
              :editing="editingField === field.name"
              :pool="pool"
              :bundle="bundle"
              @begin="editingField = field.name"
              @end="editingField = null"
              @inline-change="change => emit('inline-change', change)"
            />
          </div>
          <div v-else :class="LAYOUT.labeledBlock">
            <span :class="d.sectionTitle">{{ field.label }}</span>
            <InlineField
              :field="field"
              :editable="editable"
              :quantitative="quantitative"
              :pool="pool"
              :bundle="bundle"
              @inline-change="change => emit('inline-change', change)"
            />
          </div>
        </template>
        <div
          v-for="field in inlineMapsOf(group)"
          :key="field.name"
          :class="LAYOUT.labeledBlock"
        >
          <span :class="LAYOUT.sectionTitle">{{ field.label }}</span>
          <InlineField
            :field="field"
            :editable="editable"
            :quantitative="quantitative"
            :pool="pool"
            :bundle="bundle"
            @inline-change="change => emit('inline-change', change)"
          />
        </div>
      </section>

      <section v-for="relation in relationViews" :key="relation.key" :class="d.stackTight">
        <span :class="LAYOUT.sectionTitle">{{ relation.label }}</span>
        <div :class="LAYOUT.row">
          <InstanceInlineRef
            v-for="ref in relation.shown"
            :key="ref.id"
            :type="String(ref?.typeId || '')"
            :id="ref?.id"
            :entity="pool?.[ref?.typeId]?.[ref?.id] || ref?.entity || null"
            :context-action-entries="inlineRefEntries(relation.key, ref)"
          />
          <Tag v-if="relation.overflow === 'count' && relation.hidden > 0" :value="`+${relation.hidden}`" severity="contrast" />
          <Button
            v-if="(relation.overflow === 'more' && relation.hidden > 0) || relation.expanded"
            :label="relation.expanded ? $t('uiMapping.showLess') : $t('uiMapping.showMore', { count: relation.hidden })"
            size="small"
            text
            @click="$emit('toggle', relation.key)"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import { LAYOUT, resolveSurface, resolveActionButton, applyBudget, SCALAR_BASES, DETAIL_FACT_BUDGET, RENDERABLE_PREVIEW_MODES, ASPECT_PREVIEW_MODES, resolveFieldGroups, resolvePreview, fieldLabelKey, localizedLabel, startCaseKey, isIdentifierField, typeIsQuantitative } from '#shared/ui-mapping/index.js';
import InlineField from './InlineField.vue';
import StructuralFieldPanel from './StructuralFieldPanel.vue';
import InstanceInlineRef from '../shared/InstanceInlineRef.vue';
import { resolveInstanceRelationRefs } from '~/utils/instance-relations.js';
import PreviewBox from './PreviewBox.vue';
import { resolvePluginPreview } from '~/components/generated/plugin-preview-bindings.js';

const props = defineProps({
  instance: { type: Object, required: true },
  type: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  actions: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  expanded: { type: Object, default: () => ({}) },
  coveredRelations: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false }
});

const emit = defineEmits(['toggle', 'inline-change', 'run', 'open-instance']);
const d = inject('uiMappingSpacing');

// One structural panel edits at a time (SPEC UI): the parent owns the
// editing field name, StructuralFieldPanel owns its draft.
const editingField = ref(null);
// Per-group fact expansion: the budget collapses a wide fact group behind
// one show-more control that reaches every row.
const expandedFacts = ref({});

const surface = computed(() => resolveSurface(props.type, { variant: props.variant }));
const quantitative = computed(() => typeIsQuantitative(props.type));
// SPEC §22.8: the preview treatment follows the content — prose flows
// at the body's measure, a page fills the column's width at its own
// aspect, bounded media fills the framed region; the quiet glyph band
// stays bare. Band choice mirrors PreviewBox's branch order: plugin,
// payload, declared source, quiet.
const heroBand = computed(() => {
  if (resolvePluginPreview(String(props.type?.id || ''))) return LAYOUT.previewHeroBandContent;
  const mode = props.instance.payload?.fileId ? resolvePreview(props.type).mode : null;
  if (mode && RENDERABLE_PREVIEW_MODES.includes(mode)) {
    if (ASPECT_PREVIEW_MODES.includes(mode)) return LAYOUT.previewHeroBandAspect;
    if (mode === 'text') return LAYOUT.previewHeroBandFlow;
    return LAYOUT.previewHeroBandContent;
  }
  if (props.type?.previewSource?.display === 'geometry' && props.instance.previewSource) return LAYOUT.previewHeroBandContent;
  return LAYOUT.previewHeroBand;
});
// SPEC §22.8: a single-group body renders its fields with no group titles.
const showGroupTitles = computed(() => groups.value.filter(group => group.label).length > 1);
const hasPreview = computed(() => surface.value.slots.includes('preview'));

const isLongString = descriptor => descriptor.base === 'string'
  && (descriptor.multiline === true || (descriptor.max || 0) >= 120);
const isScalarFact = field => SCALAR_BASES.includes(field.descriptor.base) && !isLongString(field.descriptor);
const { te, t } = useI18n();
const fieldLabelKeyOf = name => fieldLabelKey(props.type?.id, name);
// Fact labels resolve through the stable generated keys first (see the
// ui-mapping label contract); the resolver-derived label stays the
// fallback, so detail surfaces read the same labels as collections.
const groups = computed(() => resolveFieldGroups(props.type)
  .map(group => ({
    ...group,
    fields: group.fields
      .filter(field => !isIdentifierField(props.type, field.name))
      .map(field => ({
        ...field,
        value: props.instance.fields?.[field.name],
        label: localizedLabel({ te, t }, fieldLabelKeyOf(field.name), field.label)
      }))
  })));
const isQuantityMap = field => field.descriptor.base === 'map'
  && field.descriptor.itemType?.base === 'quantity';
// Structural fields follow the scalar law: an unfilled field renders
// nothing (empty panels are junk).
const editableNow = field => hasValue(field);
const inlineMapsOf = group => group.fields.filter(field => isQuantityMap(field) && editableNow(field));
const isRichStructure = field => {
  const value = field.value;
  if (field.descriptor.base === 'blob') return false;
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.keys(value).length > 1;
  if (Array.isArray(value)) return value.length > 2;
  return typeof value === 'string' && value.length > 80;
};
const hasValue = field => field.value !== null
  && field.value !== undefined
  && field.value !== '';
// The identifier field drops at the group projection (the title owns
// that value); every body grammar below inherits the cut.
const scalarsOf = group => group.fields.filter(field => isScalarFact(field) && hasValue(field));
const structuralOf = group => group.fields.filter(field => !isScalarFact(field) && !isQuantityMap(field) && editableNow(field));
const shownFacts = group => {
  const scalars = scalarsOf(group);
  if (expandedFacts.value[group.id]) return scalars;
  const outcome = applyBudget(scalars, DETAIL_FACT_BUDGET);
  return outcome.mode === 'collapsed' ? outcome.visible : scalars;
};
const hiddenFactCount = group => {
  if (expandedFacts.value[group.id]) return 0;
  const outcome = applyBudget(scalarsOf(group), DETAIL_FACT_BUDGET);
  return outcome.mode === 'collapsed' ? outcome.hidden : 0;
};
const factGroupExpanded = group => Boolean(expandedFacts.value[group.id]);
const toggleFacts = group => {
  expandedFacts.value = { ...expandedFacts.value, [group.id]: !expandedFacts.value[group.id] };
};

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

function inlineRefEntries(key, ref = {}) {
  if (ref?.id === null || ref?.id === undefined) return [];
  return (inlineActionsByKey.value.get(key) || [])
    .filter((action) => {
      const targetTypes = action.relation?.targetTypes || [];
      return ref.typeId ? targetTypes.includes(ref.typeId) : targetTypes.length === 1;
    })
    .map(action => ({
      action,
      entity: props.instance,
      context: { data: { relations: { [key]: { type: ref.typeId, id: ref.id } } } }
    }));
}

const relationViews = computed(() => {
  if (!surface.value.slots.includes('relations')) return [];
  // Per-SLOT budgets (the surface entry's `relations` budget) apply to
  // every relation entry — the documented budget mechanism, not a
  // per-relation-key lookup that never resolves.
  const budget = surface.value.budgets.relations || null;
  return Object.entries(props.instance.relations || {})
    .filter(([key]) => !props.coveredRelations.includes(key))
    .map(([key, refs]) => {
    // Stored relation shapes normalize through the one app resolver: a
    // typeless ref adopts the relation's single declared target.
    const edgeTypes = props.type?.edges?.relations?.[key]?.types || [];
    const list = resolveInstanceRelationRefs(refs, { typeId: edgeTypes.length === 1 ? edgeTypes[0] : null });
    const outcome = applyBudget(list, budget);
    const isOpen = budget?.overflow === 'more' && props.expanded[key];
    return {
      key,
      // Relation labels ride the field label override channel; the
      // start-cased relation key is the fallback, like field labels.
      label: localizedLabel({ te, t }, fieldLabelKey(props.type?.id, key), startCaseKey(key)),
      overflow: budget?.overflow || 'all',
      shown: isOpen ? list : outcome.visible,
      hidden: outcome.hidden,
      mode: outcome.mode,
      expanded: Boolean(isOpen)
    };
  });
});
</script>
