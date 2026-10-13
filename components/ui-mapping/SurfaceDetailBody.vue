<template>
  <div v-if="d" :class="d.stack">
    <PreviewBox v-if="hasPreview" :type="type" :instance="instance" :payload="instance.payload" :preview-source="instance.previewSource" :seed="instance.id" />

    <section v-for="group in groups" :key="group.id" :class="d.stackTight">
      <span v-if="group.label" :class="d.sectionTitle">{{ group.label }}</span>
      <div v-if="shownFacts(group).length" :class="LAYOUT.specList">
        <div v-for="field in shownFacts(group)" :key="field.name" :class="d.specRow">
          <span :class="LAYOUT.labelCell">{{ field.label }}</span>
          <div :class="LAYOUT.factCell">
            <InlineField
              :field="field"
              :editable="editable"
              :editing="editing"
              :draft="draft"
              :pool="pool"
              :bundle="bundle"
              @inline-change="change => emit('inline-change', change)"
            />
          </div>
        </div>
        <div v-if="hiddenFactCount(group) > 0" :class="d.specRow">
          <span class="text-body text-muted">…</span>
          <Tag :value="`+${hiddenFactCount(group)}`" severity="contrast" />
        </div>
      </div>
      <Fieldset
        v-if="structuralOf(group).length === 1 && isRichStructure(structuralOf(group)[0])"
        :legend="structuralOf(group)[0].label"
        toggleable
        class="w-full"
      >
        <div :class="LAYOUT.panelBody">
          <FieldControl
            v-if="editing"
            v-model="draft[structuralOf(group)[0].name]"
            :descriptor="structuralOf(group)[0].descriptor"
            variant="detail"
            :pool="pool"
            :bundle="bundle"
          />
          <FieldControl
            v-else
            :model-value="instance.fields?.[structuralOf(group)[0].name]"
            :descriptor="structuralOf(group)[0].descriptor"
            variant="row"
            :pool="pool"
            :bundle="bundle"
          />
        </div>
      </Fieldset>
      <div v-else-if="structuralOf(group).length === 1" :class="d.specRow">
        <span class="text-body text-muted">{{ structuralOf(group)[0].label }}</span>
        <InlineField
          :field="structuralOf(group)[0]"
          :editable="editable"
          :editing="editing"
          :draft="draft"
          :pool="pool"
          :bundle="bundle"
          @inline-change="change => emit('inline-change', change)"
        />
      </div>
      <div
        v-for="field in inlineMapsOf(group)"
        :key="field.name"
        class="flex w-full flex-col gap-1"
      >
        <span :class="LAYOUT.sectionTitle">{{ field.label }}</span>
        <InlineField
          :field="field"
          :editable="editable"
          :editing="editing"
          :draft="draft"
          :pool="pool"
          :bundle="bundle"
          @inline-change="change => emit('inline-change', change)"
        />
      </div>
      <Accordion v-if="structuralOf(group).length > 1" :value="['0']" multiple class="w-full">
        <AccordionPanel
          v-for="(field, index) in structuralOf(group)"
          :key="field.name"
          :value="String(index)"
          :header="field.label"
        >
          <div :class="LAYOUT.panelBody">
            <FieldControl
              v-if="editing"
              v-model="draft[field.name]"
              :descriptor="field.descriptor"
              variant="detail"
              :pool="pool"
              :bundle="bundle"
            />
            <FieldControl
              v-else
              :model-value="instance.fields?.[field.name]"
              :descriptor="field.descriptor"
              variant="row"
              :pool="pool"
              :bundle="bundle"
            />
          </div>
        </AccordionPanel>
      </Accordion>
    </section>

    <div v-for="relation in relationViews" :key="relation.key" :class="LAYOUT.row">
      <InstanceInlineRef
        v-for="ref in relation.shown"
        :key="ref.id"
        :type="String(ref?.type || '')"
        :id="ref?.id"
        :entity="pool?.[ref?.type]?.[ref?.id] || null"
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

    <HierarchyTree
      v-if="surface.slots.includes('children')"
      :root="instance"
      :bundle="bundle"
      :pool="pool"
      @open="target => emit('open-instance', target)"
    />
  </div>
</template>

<script setup>
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import Fieldset from 'primevue/fieldset';
import { LAYOUT, resolveSurface, applyBudget, SCALAR_BASES, DETAIL_FACT_BUDGET, resolveFieldGroups, fieldLabelKey, localizedLabel } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import InlineField from './InlineField.vue';
import InstanceInlineRef from '../shared/InstanceInlineRef.vue';
import PreviewBox from './PreviewBox.vue';
import HierarchyTree from './HierarchyTree.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  type: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  actions: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  expanded: { type: Object, default: () => ({}) },
  coveredRelations: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
  editing: { type: Boolean, default: false },
  draft: { type: Object, default: null }
});

const emit = defineEmits(['toggle', 'inline-change', 'run', 'open-instance']);
const d = inject('uiMappingSpacing');

const surface = computed(() => resolveSurface(props.type, { variant: props.variant }));
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
    fields: group.fields.map(field => ({
      ...field,
      value: props.instance.fields?.[field.name],
      label: localizedLabel({ te, t }, fieldLabelKeyOf(field.name), field.label)
    }))
  })));
const isQuantityMap = field => field.descriptor.base === 'map'
  && field.descriptor.itemType?.base === 'quantity';
// Structural fields follow the scalar law: an unfilled field renders
// nothing in display mode (empty panels are junk) and joins the surface
// only while editing, where every declared field exposes its editor.
const editableNow = field => props.editing || hasValue(field);
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
const scalarsOf = group => group.fields.filter(field => isScalarFact(field) && (props.editing || hasValue(field)));
const structuralOf = group => group.fields.filter(field => !isScalarFact(field) && !isQuantityMap(field) && editableNow(field));
const shownFacts = group => {
  const outcome = applyBudget(scalarsOf(group), DETAIL_FACT_BUDGET);
  return outcome.mode === 'collapsed' ? outcome.visible : scalarsOf(group);
};
const hiddenFactCount = group => {
  const outcome = applyBudget(scalarsOf(group), DETAIL_FACT_BUDGET);
  return outcome.mode === 'collapsed' ? outcome.hidden : 0;
};

const relationViews = computed(() => {
  if (!surface.value.slots.includes('relations')) return [];
  // Per-SLOT budgets (the surface entry's `relations` budget) apply to
  // every relation entry — the documented budget mechanism, not a
  // per-relation-key lookup that never resolves.
  const budget = surface.value.budgets.relations || null;
  return Object.entries(props.instance.relations || {})
    .filter(([key]) => !props.coveredRelations.includes(key))
    .map(([key, refs]) => {
    const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
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
</script>
