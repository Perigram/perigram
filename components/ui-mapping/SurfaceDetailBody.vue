<template>
  <div v-if="d" :class="d.screenRoot">
    <!-- The record document's section flow (SPEC §22.17, §26): the body's
         own sections render in the composed order — the property block
         (the declared scalar facts as compact property rows, collapsed to
         filled values behind the per-group show-more control; the
         compiled facts), the
         dominant band with the declared open sections riding beneath it,
         each relation section — and the child collections and custom
         blocks compose around them through the host's slot. Without an
         overlay the flow is the derivation order, byte-identical to the
         fixed document. -->
    <template v-for="section in flowSections" :key="section.key">
      <DocumentSectionShell
        v-if="section.key === 'properties'"
        :session="overlaySession"
        section-key="properties"
        :index="section.index"
      >
        <section v-for="group in propertyGroups" :key="`props:${group.id}`" :class="d.stackTight">
          <span v-if="showGroupTitles && group.label" :class="d.sectionTitle">{{ group.label }}</span>
          <div :class="LAYOUT.specList">
            <PropertyRows
              :fields="shownFacts(group)"
              :hidden-count="hiddenFactCount(group)"
              :expanded="factGroupExpanded(group)"
              :editable="editable"
              :quantitative="quantitative"
              :pool="pool"
              :bundle="bundle"
              grouped
              @toggle="toggleFacts(group)"
              @inline-change="change => emit('inline-change', change)"
            />
          </div>
        </section>
      </DocumentSectionShell>

      <DocumentSectionShell
        v-else-if="section.key === 'editor'"
        :session="overlaySession"
        section-key="editor"
        :index="section.index"
      >
        <div v-if="editorSurface" :class="[editorBand, 'relative']">
          <RecordEditorBody :surface="editorSurface" :instance="instance" :type="type" />
          <div class="absolute right-2 top-2 z-10">
            <PayloadRevisionPicker
              :entity="instance"
              :type="type"
            />
          </div>
        </div>
        <div v-else-if="hasPreview" :class="LAYOUT.previewHero" class="relative">
          <div :class="heroBand" :style="bandHeightStyle">
            <PreviewBox variant="pane" :type="type" :instance="instance" :payload="instance.payload" :preview-source="instance.previewSource" />
          </div>
          <!-- The version surface rides the content it versions: its trigger
               sits on the preview's corner. -->
          <div v-if="variant === 'full'" class="absolute right-2 top-2 z-10">
            <PayloadRevisionPicker
              :entity="instance"
              :type="type"
            />
          </div>
          <!-- A framed preview on the record page is reader-resizable: the
               grip drags the band's height, the content refits inside. -->
          <div
            v-if="bandResizable"
            :class="LAYOUT.clip"
            class="flex h-4 cursor-row-resize touch-none items-center justify-center"
            role="separator"
            :aria-label="t('uiMapping.resizePreview')"
            @pointerdown="beginBandResize"
          >
            <span class="h-0.5 w-10 rounded-ui bg-content-border" />
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
            v-for="group in visibleGroups"
            :key="group.id"
            :class="d.stackTight"
          >
            <span v-if="showGroupTitles && group.label && (!documentBody || openSectionCount(group) > 0)" :class="d.sectionTitle">{{ group.label }}</span>
            <div v-if="!documentBody && shownFacts(group).length" :class="variant === 'full' ? LAYOUT.factsGrid : LAYOUT.specList">
              <PropertyRows
                :fields="shownFacts(group)"
                :hidden-count="hiddenFactCount(group)"
                :expanded="factGroupExpanded(group)"
                :editable="editable"
                :quantitative="quantitative"
                :pool="pool"
                :bundle="bundle"
                @toggle="toggleFacts(group)"
                @inline-change="change => emit('inline-change', change)"
              />
            </div>
            <!-- Structural fields follow the section grammar of everything else
                 on the record page: a labeled open block per field, rendered in
                 the open. The declaration pencil rides the label for holders
                 (SPEC §1). -->
            <template v-for="field in peekPresentation ? [] : structuralOf(group)" :key="field.name">
              <div v-if="isRichStructure(field)" :class="LAYOUT.labeledBlock">
                <div class="group/ck-field flex items-center gap-1">
                  <span :class="LAYOUT.sectionTitle">{{ field.label }}</span>
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
              v-for="field in peekPresentation ? [] : inlineMapsOf(group)"
              :key="field.name"
              :class="LAYOUT.labeledBlock"
            >
              <div class="group/ck-field flex items-center gap-1">
                <span :class="LAYOUT.sectionTitle">{{ field.label }}</span>
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

          <RelationChipSection
            v-for="relation in documentBody || peekPresentation ? [] : relationViews"
            :key="relation.key"
            :relation="relation"
            :instance="instance"
            :actions="actions"
            :pool="pool"
            @toggle="key => emit('toggle', key)"
          />
        </div>
      </DocumentSectionShell>

      <DocumentSectionShell
        v-else-if="relationFor(section.key)"
        :session="overlaySession"
        :section-key="section.key"
        :index="section.index"
      >
        <RelationChipSection
          :relation="relationFor(section.key)"
          :instance="instance"
          :actions="actions"
          :pool="pool"
          @toggle="key => emit('toggle', key)"
        />
      </DocumentSectionShell>

      <slot v-else name="document-section" :section="section" />
    </template>
  </div>
</template>

<script setup>
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { LAYOUT, resolveSurface, applyBudget, SCALAR_BASES, DETAIL_FACT_BUDGET, RENDERABLE_PREVIEW_MODES, ASPECT_PREVIEW_MODES, resolveFieldGroups, resolvePreview, fieldLabelKey, localizedLabel, startCaseKey, isIdentifierField, typeIsQuantitative, composeDocumentSections } from '#shared/ui-mapping/index.js';
import { isRefDescriptor, refAcceptsOf } from '#packages/cts';
import InlineField from './InlineField.vue';
import PropertyRows from './PropertyRows.vue';
import StructuralFieldPanel from './StructuralFieldPanel.vue';
import RelationChipSection from './RelationChipSection.vue';
import DocumentSectionShell from './DocumentSectionShell.vue';
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
  presentation: { type: String, default: 'record' },
  // The instance's saved overlay (SPEC §26): the applied arrangement when
  // no live composition supersedes it.
  overlay: { type: Object, default: null },
  // The document's child collection sections (`[{ key }]` in derivation
  // order) the composition interleaves when an overlay or session is
  // live.
  childSections: { type: Array, default: () => [] }
});

const emit = defineEmits(['toggle', 'inline-change', 'run', 'open-instance']);
const d = inject('uiMappingSpacing');
const hostTraits = useHostContainerTraits();
const embedded = inject('uiMappingEmbedded', false);
// The record document body (SPEC §22.17): the full variant in the record
// presentation leads with the property block and stacks its open sections
// full width. The peek keeps the preview and the leading fact group; the
// nested Card variants keep the fill grammar.
const documentBody = computed(() => props.variant === 'full' && props.presentation === 'record');
const peekPresentation = computed(() => props.presentation === 'peek');

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
// The editor mount of an editor-bound type (SPEC §4): the compact
// document's dominant content — the record popup's body, since the open
// page surfaces resolve the editor page in RegionBlock. The peek keeps
// its preview; nested Card bodies keep the preview presentation.
const editorSurface = computed(() => {
  if (props.variant !== 'full' || props.presentation === 'peek') return null;
  if (!props.instance?.id || !props.type?.id) return null;
  return resolveFileSurface(null, props.type.id);
});
const editorBand = LAYOUT.editorBandBounded;
// A framed preview on the record page is reader-resizable (owner
// direction 2026-11-13): the grip drags the band's height directly; the
// unset state keeps the stylesheet's viewport-derived height.
const FRAMED_BANDS = [LAYOUT.previewHeroBandContent, LAYOUT.previewHeroBandAspect];
const bandResizable = computed(() => documentBody.value && FRAMED_BANDS.includes(heroBand.value));
const bandHeight = ref(null);
const bandHeightStyle = computed(() => (bandHeight.value ? { height: `${bandHeight.value}px` } : undefined));
function beginBandResize(event) {
  const handle = event.currentTarget;
  const band = handle.parentElement?.firstElementChild;
  if (!band) return;
  const startY = event.clientY;
  const startHeight = band.getBoundingClientRect().height;
  const onMove = moveEvent => {
    const next = Math.round(startHeight + moveEvent.clientY - startY);
    bandHeight.value = Math.max(128, Math.min(next, 1440));
  };
  const end = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.setPointerCapture?.(event.pointerId);
}

const isLongString = descriptor => descriptor.base === 'string'
  && (descriptor.multiline === true || (descriptor.max || 0) >= 120);
const isScalarFact = field => SCALAR_BASES.includes(field.descriptor.base) && !isLongString(field.descriptor);
const isRelationField = field => isRefDescriptor(field.descriptor);
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
const propertyGroups = computed(() => groups.value.filter(group => scalarsOf(group).length > 0));
// The peek body is the record's preview and its leading fact group — the
// bounded panel composes, never scrolls (SPEC §22.14).
const visibleGroups = computed(() => (peekPresentation.value
  ? propertyGroups.value.slice(0, 1)
  : groups.value));
const factRowsOf = group => scalarsOf(group);
const openSectionCount = group => structuralOf(group).length + inlineMapsOf(group).length;
const structuralOf = group => group.fields.filter(field => !isRelationField(field) && !isScalarFact(field) && !isQuantityMap(field) && editableNow(field));
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
    const edgeTypes = props.type?.edges?.relations?.[key]?.types || refAcceptsOf(props.type?.fields?.[key]);
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

// The document's section flow (SPEC §26): the applied overlay composes
// around
// the declared keys; the session and the render site stay in sync
// through syncFlow.
const overlaySessionRef = inject('recordOverlaySession', null);
const overlaySession = computed(() => overlaySessionRef?.value || null);
const appliedOverlay = computed(() => overlaySession.value?.applied || props.overlay);
const composing = computed(() => Boolean(appliedOverlay.value || overlaySession.value));
const relationByKey = computed(() => new Map(relationViews.value.map(relation => [`relation:${relation.key}`, relation])));
const relationFor = key => relationByKey.value.get(key) || null;
const ownDeclaredKeys = computed(() => [
  ...(propertyGroups.value.length ? ['properties'] : []),
  'editor',
  ...relationViews.value.map(relation => `relation:${relation.key}`)
]);
const declaredKeys = computed(() => (composing.value
  ? [...ownDeclaredKeys.value, ...props.childSections.map(section => section.key)]
  : ownDeclaredKeys.value));
// The fill grammars (peek, nested cards) keep the fixed body: the band
// and the open sections in one flow position, their relation rows inside.
const flowSections = computed(() => {
  if (!documentBody.value) return [{ key: 'editor', block: null, index: 0 }];
  return composeDocumentSections(declaredKeys.value, composing.value ? appliedOverlay.value : null)
    .map((section, index) => ({ ...section, index }));
});
watch(
  () => [flowSections.value.map(section => section.key).join('|'), declaredKeys.value.join('|')],
  () => overlaySession.value?.syncFlow?.(flowSections.value.map(section => section.key), declaredKeys.value),
  { immediate: true }
);
</script>
