<template>
  <div :class="LAYOUT.stack">
    <StateStrip v-if="type.states?.main" :type="type" :instance="instance" />
    <PreviewBox v-if="hasPreview" :type="type" :payload="instance.payload" :seed="instance.id" />

    <section v-for="group in groups" :key="group.id" :class="LAYOUT.stackTight">
      <span v-if="group.label" :class="LAYOUT.sectionTitle">{{ group.label }}</span>
      <div v-if="shownFacts(group).length" :class="LAYOUT.specList">
        <div v-for="field in shownFacts(group)" :key="field.name" :class="LAYOUT.specRow">
          <span :class="LAYOUT.labelCell">{{ field.label }}</span>
          <div :class="LAYOUT.factCell">
            <FieldControl
              v-if="editing"
              v-model="draft[field.name]"
              :descriptor="field.descriptor"
              variant="detail"
              :pool="pool"
              :bundle="bundle"
            />
            <FieldControl
              v-else-if="inlineValue(field) === null"
              :model-value="instance.fields?.[field.name]"
              :descriptor="field.descriptor"
              variant="row"
              :pool="pool"
              :bundle="bundle"
            />
            <Inplace v-else closable>
            <template #display>
              <div class="group -mx-1.5 flex cursor-pointer items-center gap-1.5 rounded-ui px-1.5 py-0.5 transition-colors hover:bg-subtle">
                <FieldControl
                  :model-value="inlineValue(field)"
                  :descriptor="field.descriptor"
                  variant="row"
                  :pool="pool"
                  :bundle="bundle"
                />
                <i class="pi pi-pencil text-supporting text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </template>
            <template #content>
              <FieldControl
                v-model="inlineDraft[field.name]"
                :descriptor="field.descriptor"
                variant="detail"
                :pool="pool"
                :bundle="bundle"
              />
            </template>
            </Inplace>
          </div>
        </div>
        <div v-if="hiddenFactCount(group) > 0" :class="LAYOUT.specRow">
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
      <div v-else-if="structuralOf(group).length === 1" :class="LAYOUT.specRow">
        <span class="text-body text-muted">{{ structuralOf(group)[0].label }}</span>
        <FieldControl
          :model-value="instance.fields?.[structuralOf(group)[0].name]"
          :descriptor="structuralOf(group)[0].descriptor"
          variant="row"
          :pool="pool"
          :bundle="bundle"
        />
      </div>
      <Accordion v-else-if="structuralOf(group).length" :value="['0']" multiple class="w-full">
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

    <div v-for="relation in relationViews" :key="relation.key" :class="relationClass(relation)">
      <InstanceChip v-for="ref in relation.shown" :key="ref.id" :value="ref" :pool="pool" :bundle="bundle" />
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
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import Fieldset from 'primevue/fieldset';
import Inplace from 'primevue/inplace';
import { reactive } from 'vue';
import { LAYOUT, resolveSurface, applyBudget, SCALAR_BASES, DETAIL_FACT_BUDGET, resolveFieldGroups } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import InstanceChip from './InstanceChip.vue';
import PreviewBox from './PreviewBox.vue';
import HierarchyTree from './HierarchyTree.vue';
import StateStrip from './StateStrip.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  type: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  expanded: { type: Object, default: () => ({}) },
  coveredRelations: { type: Array, default: () => [] },
  editing: { type: Boolean, default: false },
  draft: { type: Object, default: null }
});

defineEmits(['toggle']);

const inlineDraft = reactive({});
const inlineValue = field => {
  if (!(field.name in inlineDraft)) inlineDraft[field.name] = props.instance.fields?.[field.name];
  return inlineDraft[field.name];
};
const surface = computed(() => resolveSurface(props.type, { variant: props.variant }));
const hasPreview = computed(() => surface.value.slots.includes('preview'));

const isLongString = descriptor => descriptor.base === 'string'
  && (descriptor.multiline === true || (descriptor.max || 0) >= 120);
const isScalarFact = field => SCALAR_BASES.includes(field.descriptor.base) && !isLongString(field.descriptor);
const groups = computed(() => resolveFieldGroups(props.type));
const isRichStructure = field => {
  const value = props.instance.fields?.[field.name];
  if (field.descriptor.base === 'blob') return false;
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.keys(value).length > 1;
  if (Array.isArray(value)) return value.length > 2;
  return typeof value === 'string' && value.length > 80;
};
const hasValue = field => props.instance.fields?.[field.name] !== null
  && props.instance.fields?.[field.name] !== undefined
  && props.instance.fields?.[field.name] !== '';
const scalarsOf = group => group.fields.filter(field => isScalarFact(field) && (props.editing || hasValue(field)));
const structuralOf = group => group.fields.filter(field => !isScalarFact(field));
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
  return Object.entries(props.instance.relations || {})
    .filter(([key]) => !props.coveredRelations.includes(key))
    .map(([key, refs]) => {
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
  ? relation.mode === 'scroll' ? 'flex max-h-48 flex-wrap gap-2 overflow-y-auto' : LAYOUT.chipRow
  : LAYOUT.row);
</script>
