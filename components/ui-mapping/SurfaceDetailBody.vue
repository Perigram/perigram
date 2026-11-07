<template>
  <div v-if="d" :class="d.stack">
    <!-- The property block (SPEC §22.17): the record body leads with the
         declared scalar facts as compact property rows — small muted
         label, ink value — collapsed to filled values behind the
         per-group show-more control; single-group bodies carry no group
         titles. For declaration-authoring holders the block projects the
         stationing draft (SPEC §1): every declared scalar field in
         authored order, empty ones included, each row carrying its author
         affordance and the block ending in add-field — non-holders keep
         the compiled fact block byte-identical. -->
    <template v-if="documentBody">
      <section v-for="group in propertyGroups" :key="`props:${group.id}`" :class="d.stackTight">
        <span v-if="showGroupTitles && group.label" :class="d.sectionTitle">{{ group.label }}</span>
        <div :class="LAYOUT.specList">
          <div v-for="field in shownFacts(group)" :key="field.name" :class="[d.specRow, 'group/ck-field']">
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
              <DeclarationFieldMenu
                v-if="authoringReady && authoringFieldByName.has(field.name)"
                :authoring="authoring"
                :field="authoringFieldByName.get(field.name)"
                :type-options="authoring.typeOptions.value"
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
          <div v-if="authoringReady && group.id === 'declaration'" class="flex flex-wrap items-center gap-2 pt-1">
            <DeclarationAddField :authoring="authoring" :type-options="authoring.typeOptions.value" />
            <DeclarationSaveButton
              v-if="authoring.dirty.value || authoring.saving.value"
              class="ml-auto"
              :authoring="authoring"
            />
          </div>
        </div>
      </section>
    </template>
    <!-- The editor is the record body (SPEC §4): an editor-bound type's
         full variant mounts the editor surface as the dominant content
         and the version trigger rides its corner; every other shape (and
         the peek presentation) keeps the preview band. -->
    <div v-if="editorSurface" :class="[editorBand, 'relative']">
      <RecordEditorBody :surface="editorSurface" :instance="instance" :type="type" />
      <div class="absolute right-3 top-3 z-10">
        <PayloadRevisionPicker
          :entity="instance"
          :type="type"
        />
      </div>
    </div>
    <div v-else-if="hasPreview" :class="LAYOUT.previewHero" class="relative">
      <div :class="heroBand">
        <PreviewBox variant="pane" :type="type" :instance="instance" :payload="instance.payload" :preview-source="instance.previewSource" />
      </div>
      <!-- The version surface rides the content it versions: its trigger
           sits on the preview's corner. -->
      <div v-if="variant === 'full'" class="absolute right-3 top-3 z-10">
        <PayloadRevisionPicker
          :entity="instance"
          :type="type"
        />
      </div>
    </div>

    <!-- The record body fills its surface (SPEC §Generative UI,
         2026-10-22): content blocks — field groups, relation chip rows —
         share a container-derived column grid; rich structural blocks
         span the full row. Fact rows flow into their own finer grid
         inside each group. The record document (SPEC §22.17) stacks the
         open sections full width — its scalar facts lead in the property
         block above. -->
    <div :class="documentBody ? d.stack : LAYOUT.bodyGrid">
      <section
        v-for="group in groups"
        :key="group.id"
        :class="d.stackTight"
      >
        <span v-if="showGroupTitles && group.label && (!documentBody || openSectionCount(group) > 0)" :class="d.sectionTitle">{{ group.label }}</span>
        <div v-if="!documentBody && shownFacts(group).length" :class="variant === 'full' ? LAYOUT.factsGrid : LAYOUT.specList">
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
             the open. The declaration pencil rides the label for holders
             (SPEC §1). -->
        <template v-for="field in structuralOf(group)" :key="field.name">
          <div v-if="isRichStructure(field)" :class="LAYOUT.labeledBlock">
            <div class="group/ck-field flex items-center gap-1">
              <span :class="LAYOUT.sectionTitle">{{ field.label }}</span>
              <DeclarationFieldMenu
                v-if="authoringReady && authoringFieldByName.has(field.name)"
                :authoring="authoring"
                :field="authoringFieldByName.get(field.name)"
                :type-options="authoring.typeOptions.value"
              />
            </div>
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
            <div class="group/ck-field flex items-center gap-1">
              <span :class="d.sectionTitle">{{ field.label }}</span>
              <DeclarationFieldMenu
                v-if="authoringReady && authoringFieldByName.has(field.name)"
                :authoring="authoring"
                :field="authoringFieldByName.get(field.name)"
                :type-options="authoring.typeOptions.value"
              />
            </div>
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
          <div class="group/ck-field flex items-center gap-1">
            <span :class="LAYOUT.sectionTitle">{{ field.label }}</span>
            <DeclarationFieldMenu
              v-if="authoringReady && authoringFieldByName.has(field.name)"
              :authoring="authoring"
              :field="authoringFieldByName.get(field.name)"
              :type-options="authoring.typeOptions.value"
            />
          </div>
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
import DeclarationFieldMenu from '../type-designer/DeclarationFieldMenu.vue';
import DeclarationAddField from '../type-designer/DeclarationAddField.vue';
import DeclarationSaveButton from '../type-designer/DeclarationSaveButton.vue';
import { resolveInstanceRelationRefs } from '~/utils/instance-relations.js';
import { useHostContainerTraits } from '~/composables/useContainerTraits.js';
import PreviewBox from './PreviewBox.vue';
import PayloadRevisionPicker from '~/components/generated/PayloadRevisionPicker.vue';
import RecordEditorBody from '~/components/generated/RecordEditorBody.vue';
import { resolvePluginPreview } from '~/components/generated/plugin-preview-bindings.js';
import { resolveFileSurface } from '~/components/generated/file-surfaces.js';

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
  // The depth-0 record treatment: `peek` keeps the preview presentation
  // over the body (the record peek); `record` (the default) mounts the
  // editor of an editor-bound type as the body.
  presentation: { type: String, default: 'record' }
});

const emit = defineEmits(['toggle', 'inline-change', 'run', 'open-instance']);
const d = inject('uiMappingSpacing');
// The record page's declaration authoring session (SPEC §1): provided by
// DeclarationAuthoring at the depth-0 record; null keeps the compiled fact
// grammar byte-identical for non-holders.
const authoring = inject('declarationAuthoring', null);
const authoringReady = computed(() => Boolean(authoring?.ready?.value));
const authoringFields = computed(() => authoring?.subtree?.value?.fields || []);
const authoringFieldByName = computed(() => new Map(
  authoringFields.value
    .map(field => [field.node?.data?.name, field])
    .filter(([name]) => Boolean(name))
));
const hostTraits = useHostContainerTraits();
const embedded = inject('uiMappingEmbedded', false);
// The record document body (SPEC §22.17): the full variant in the record
// presentation leads with the property block and stacks its open sections
// full width. The peek and nested Card variants keep the fill grammar.
const documentBody = computed(() => props.variant === 'full' && props.presentation === 'record');

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
  // The page-fill band belongs to the standalone record page: an
  // every Card variant and a narrow
  // host (the record peek — arrangement sees the measured width) render
  // the bounded band.
  const bounded = embedded || props.variant === 'detail' || hostTraits.value?.width === 'narrow';
  const band = heroBandOfPage();
  return bounded && band !== LAYOUT.previewHeroBand ? LAYOUT.previewEmbedBand : band;
});
const heroBandOfPage = () => {
  if (resolvePluginPreview(String(props.type?.id || ''))) return LAYOUT.previewHeroBandContent;
  const mode = props.instance.payload?.fileId ? resolvePreview(props.type).mode : null;
  if (mode && RENDERABLE_PREVIEW_MODES.includes(mode)) {
    if (ASPECT_PREVIEW_MODES.includes(mode)) return LAYOUT.previewHeroBandAspect;
    if (mode === 'text') return LAYOUT.previewHeroBandFlow;
    return LAYOUT.previewHeroBandContent;
  }
  if (props.type?.previewSource?.display === 'geometry' && props.instance.previewSource) return LAYOUT.previewHeroBandContent;
  return LAYOUT.previewHeroBand;
};
// SPEC §22.8: a single-group body renders its fields with no group titles.
const showGroupTitles = computed(() => groups.value.filter(group => group.label).length > 1);
const hasPreview = computed(() => surface.value.slots.includes('preview'));
// The editor mount of an editor-bound type (SPEC §4): the record body's
// full variant in the record presentation. The peek keeps its preview;
// nested Card bodies keep the preview presentation.
const editorSurface = computed(() => {
  if (props.variant !== 'full' || props.presentation === 'peek') return null;
  if (!props.instance?.id || !props.type?.id) return null;
  return resolveFileSurface(null, props.type.id);
});
const editorBand = computed(() => (hostTraits.value?.hostKind === 'popup'
  ? LAYOUT.editorBandBounded
  : LAYOUT.editorBand));

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
// The holder's property block projects the draft (SPEC §1): every declared
// scalar field in authored order, empty ones included — the compiled
// identifier cut applies through the descriptor's identifier flag.
const declarationRows = computed(() => authoringFields.value
  .map(({ node }) => node?.data || {})
  .filter(data => data.name && data.descriptor && data.descriptor.identifier !== true)
  .filter(data => isScalarFact({ descriptor: data.descriptor }))
  .map(data => ({
    name: data.name,
    descriptor: data.descriptor,
    value: props.instance.fields?.[data.name],
    label: localizedLabel({ te, t }, fieldLabelKeyOf(data.name), startCaseKey(data.name))
  })));
const propertyGroups = computed(() => {
  if (documentBody.value && authoringReady.value) {
    return [{ id: 'declaration', label: null, fields: declarationRows.value }];
  }
  return groups.value.filter(group => scalarsOf(group).length > 0);
});
const factRowsOf = group => (group.id === 'declaration' ? group.fields : scalarsOf(group));
const openSectionCount = group => structuralOf(group).length + inlineMapsOf(group).length;
const structuralOf = group => group.fields.filter(field => !isScalarFact(field) && !isQuantityMap(field) && editableNow(field));
const shownFacts = group => {
  const rows = factRowsOf(group);
  if (expandedFacts.value[group.id]) return rows;
  const outcome = applyBudget(rows, DETAIL_FACT_BUDGET);
  return outcome.mode === 'collapsed' ? outcome.visible : rows;
};
const hiddenFactCount = group => {
  if (expandedFacts.value[group.id]) return 0;
  const outcome = applyBudget(factRowsOf(group), DETAIL_FACT_BUDGET);
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
