<template>
  <DataView
    :value="instances"
    data-key="id"
    layout="grid"
    :paginator="instances.length > pagination.paginateAt"
    :rows="pagination.rows"
  >
    <template #grid="slotProps">
      <ResponsiveGrid variant="dense" responsive-context="container">
        <Card
          v-for="instance in slotProps.items"
          :key="instance.id"
          :class="[LAYOUT.clip, 'w-full']"
          :pt="anatomy === 'tile' ? TILE_PT : undefined"
        >
          <!-- Overlay tile: a visual preview with no fact fields — the
               preview is the card, the identifier chip rides it,
               status and the row menu float on top. -->
          <template v-if="anatomy === 'tile'" #header>
            <div :class="LAYOUT.mediaTile">
              <PreviewBox variant="stamp" :type="type" :instance="instance" :payload="instance.payload" :preview-source="instance.previewSource" />
              <div v-if="statusOf(instance) || rowMenuTarget(instance)" :class="LAYOUT.mediaTileControls">
                <Tag
                  v-if="statusOf(instance)"
                  size="small"
                  :value="statusOf(instance).label"
                  :severity="statusOf(instance).severity"
                />
                <Button
                  v-if="rowMenuTarget(instance)"
                  icon="pi pi-ellipsis-v"
                  severity="secondary"
                  size="small"
                  rounded
                  :aria-label="$t('uiMapping.moreActions')"
                  @click="event => openCardMenu(event, instance)"
                />
              </div>
              <HoverPeek
                :enabled="openable"
                @open="$emit('open', instance)"
              >
                <template #default="{ peekEvents }">
                  <div :class="[LAYOUT.mediaTileBadge, 'flex flex-col items-start gap-1']">
                    <Chip
                      v-on="peekEvents"
                      :label="identityOf(instance)"
                      :icon="iconFor(type, instance) || undefined"
                      :pt="CHIP_LABEL_PT"
                      :class="[FILE_CHIP_CLASS, { 'cursor-pointer': openable }]"
                      :title="identityOf(instance)"
                      :role="openable ? 'button' : undefined"
                      :tabindex="openable ? 0 : undefined"
                      @click="openable && $emit('open', instance)"
                      @keydown.enter.prevent="openable && $emit('open', instance)"
                    />
                    <TraceChain
                      v-if="parented"
                      :entity="instance"
                      :type-id="type?.id || ''"
                      :class="FILE_CHIP_CLASS"
                    />
                  </div>
                </template>
                <template #preview>
                  <InstancePeek :type-id="String(type?.id || '')" :instance-id="instanceIdOf(instance)" />
                </template>
              </HoverPeek>
            </div>
          </template>
          <!-- Side-preview card: a visual preview with facts — the preview
               is a bounded left column, identity and facts sit beside it. -->
          <template v-else-if="anatomy === 'side'" #content>
            <div class="flex items-stretch gap-3">
              <div :class="LAYOUT.previewSide">
                <PreviewBox variant="stamp" :type="type" :instance="instance" :payload="instance.payload" :preview-source="instance.previewSource" />
              </div>
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <div :class="LAYOUT.rowBetween">
                  <InstanceIdentity
                    :instance="instance"
                    :type="type"
                    :openable="openable"
                    @open="target => $emit('open', target)"
                  />
                  <div :class="LAYOUT.row">
                    <Tag
                      v-if="statusOf(instance)"
                      size="small"
                      :value="statusOf(instance).label"
                      :severity="statusOf(instance).severity"
                    />
                    <Button
                      v-if="rowMenuTarget(instance)"
                      icon="pi pi-ellipsis-v"
                      text
                      rounded
                      severity="secondary"
                      :aria-label="$t('uiMapping.moreActions')"
                      @click="event => openCardMenu(event, instance)"
                    />
                  </div>
                </div>
                <div :class="spacing ? spacing.stackTight : 'flex flex-col gap-3'">
                  <div v-for="field in scalarFields" :key="field.name" :class="LAYOUT.rowBetween">
                    <span class="text-supporting text-muted">{{ field.label }}</span>
                    <FieldControl
                      :model-value="instance.fields?.[field.name]"
                      :descriptor="field.descriptor"
                      variant="inline"
                      :quantitative="quantitative"
                      :pool="pool"
                      :bundle="bundle"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>
          <!-- Plain stack: a non-visual payload rides the chip beside the
               identity; the labeled budgeted facts follow. -->
          <template v-else #title>
            <div :class="LAYOUT.rowBetween">
              <span class="inline-flex min-w-0 items-center gap-2">
                <FileChip
                  v-if="instance.payload?.fileId"
                  :file="instance.payload"
                  @open="openFileChip(instance)"
                />
                <InstanceIdentity
                  :instance="instance"
                  :type="type"
                  :openable="openable"
                  @open="target => $emit('open', target)"
                />
              </span>
              <div :class="LAYOUT.row">
                <Tag
                  v-if="statusOf(instance)"
                  size="small"
                  :value="statusOf(instance).label"
                  :severity="statusOf(instance).severity"
                />
                <Button
                  v-if="rowMenuTarget(instance)"
                  icon="pi pi-ellipsis-v"
                  text
                  rounded
                  severity="secondary"
                  :aria-label="$t('uiMapping.moreActions')"
                  @click="event => openCardMenu(event, instance)"
                />
              </div>
            </div>
          </template>
          <!-- SPEC §22.8: a homogeneous collection never repeats the
               type name per card — the collection's own header names it;
               the identity surface carries the lineage trail on
               cross-cut lists. -->
          <template v-if="anatomy === 'plain'" #content>
            <div :class="spacing ? spacing.stackTight : 'flex flex-col gap-3'">
              <div v-for="field in scalarFields" :key="field.name" :class="LAYOUT.rowBetween">
                <span class="text-supporting text-muted">{{ field.label }}</span>
                <FieldControl
                  :model-value="instance.fields?.[field.name]"
                  :descriptor="field.descriptor"
                  variant="inline"
                  :quantitative="quantitative"
                  :pool="pool"
                  :bundle="bundle"
                />
              </div>
            </div>
          </template>
        </Card>
      </ResponsiveGrid>
    </template>
    <template #empty>
      <Message severity="info">{{ $t('uiMapping.emptyRegion') }}</Message>
    </template>
  </DataView>
  <Menu ref="cardMenu" :model="cardMenuItems" popup />
</template>

<script setup>
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import DataView from 'primevue/dataview';
import Card from 'primevue/card';
import Chip from 'primevue/chip';
import HoverPeek from '~/components/shared/HoverPeek.vue';
import InstancePeek from '~/components/shared/InstancePeek.vue';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Menu from 'primevue/menu';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import { useHostContainerTraits } from '~/composables/useContainerTraits.js';
import {
  LAYOUT, SCALAR_BASES, cardAnatomyFor, cardFactCount, isIdentifierField,
  fieldLabel, fieldLabelKey, localizedLabel, resolveListControls,
  resolveActionButton, actionLabelKey, stateDisplayFor, titleFor, iconFor
, typeIsQuantitative } from '#shared/ui-mapping/index.js';
import { instancePayloadFileUrl } from '~/components/generated/file-preview-contract.js';
import { resolveFileSurface } from '~/components/generated/file-surfaces.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';
import { useInstancesStore } from '~/stores/instances';
import FieldControl from './FieldControl.vue';
import PreviewBox from './PreviewBox.vue';
import TraceChain from '../shared/links/TraceChain.vue';
import InstanceIdentity from './InstanceIdentity.vue';
import FileChip from '~/components/shared/FileChip.vue';
import { CHIP_LABEL_PT, FILE_CHIP_CLASS } from '~/components/shared/chip-surface.js';
import { actionAppliesToEntity } from '~/utils/action-visibility.js';
import { generatedActionLabel } from '~/utils/generated-labels.js';
const spacing = inject('uiMappingSpacing', null);
const instancesStore = useInstancesStore();

// The tile anatomy carries its whole card in the header slot; the body
// slot stays hidden so no empty padded box trails the media.
const TILE_PT = { body: { class: 'hidden' } };

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Composed list-controls contract from the region tree; recomputed from
  // the type and loaded instances when absent (direct grid usage).
  controls: { type: Object, default: null },
  // Per-instance quick actions for the type (resolveInstanceActions):
  // status transitions, deletion, instance-scoped commands. Rendered as
  // one ellipsis menu per card; empty set renders no control.
  actions: { type: Array, default: () => [] },
  // SPEC §22.12: `{ parent, actions }` — the section's unlink actions
  // bound to the parent record (relation-scoped sections only).
  relationUnlink: { type: Object, default: null },
  // Collection identities render as links when an open handler exists.
  openable: { type: Boolean, default: false },
  // The containment cross-cut composes on this collection (unscoped
  // class list): the tile's media anatomy grounds the lineage trail
  // beside its identifier chip.
  parented: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Per-type state policy map from the compiled process contract: the
  // card status badge renders exactly when the vocabulary exists.
  statePolicy: { type: Object, default: null }
});

const quantitative = computed(() => typeIsQuantitative(props.type));

const emit = defineEmits(['open', 'run']);

const { te, t } = useI18n();

// The card anatomy follows the type's data shape (cardAnatomyFor): a
// visual preview with no facts renders the overlay tile, a visual preview
// with facts the side-preview card, everything else the plain stack.
const anatomy = computed(() => cardAnatomyFor(props.type || {}));

const resolvedControls = computed(() => props.controls || resolveListControls(props.type, props.instances));
const pagination = computed(() => resolvedControls.value.pagination);

const statusOf = instance => {
  const display = stateDisplayFor(props.statePolicy, instance?.state);
  return display ? { label: display.label, severity: display.severity } : null;
};
// The tile's identifier chip label: the one title resolver over the row.
const identityOf = instance => titleFor(instance, props.type, { unnamedLabel: t('common.unnamed') });
const instanceIdOf = instance => String(instance?._id || instance?.id || '');
// Card facts exclude the identifier field — the card title IS the
// identifier value (titleFor); a fact row would repeat it. A narrow
// host takes the compact fact budget (the container seam).
const hostContainer = useHostContainerTraits();
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([name, descriptor]) => SCALAR_BASES.includes(descriptor.base)
    && !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120)))
  .filter(([name]) => !isIdentifierField(props.type, name))
  .slice(0, cardFactCount(props.type, { compact: hostContainer.value.width === 'narrow' }))
  .map(([name, descriptor]) => ({
    name,
    descriptor,
    label: localizedLabel({ te, t }, fieldLabelKey(props.type?.id, name), fieldLabel(name, descriptor))
  })));

// The payload chip follows the type's editor binding: an editor-bound file
// opens its file-surface editor; unbound types download the payload.
function openFileChip(instance) {
  const typeId = String(props.type?.id || '');
  const surface = resolveFileSurface(null, typeId);
  if (surface?.workspacePage) {
    const entity = instancesStore.dtoFor(instancesStore.canonicalTypeKey(typeId), String(instance?.id || instance?._id || ''));
    if (entity?._id) {
      openWorkspacePageFromChrome({ pageId: surface.surface, typeId, entity });
      return;
    }
  }
  const url = instancePayloadFileUrl(instance?.payload);
  if (url) window.open(`${url}&download=1`, '_blank', 'noopener');
}

// One shared popup menu: the ellipsis renders on a card only when that
// card carries an applicable action, and menu commands re-emit through
// the region run contract with the instance as context (confirmation
// and dispatch stay upstream).
const cardMenu = ref(null);
const menuInstance = ref(null);
function openCardMenu(event, instance) {
  menuInstance.value = instance;
  cardMenu.value?.toggle(event);
}
// Action applicability resolves through the canonical seam
// (`actionAppliesToEntity`: type/parent match, authored state.from equality,
// no-op suppression).
const cardActionsFor = instance => props.actions
  .filter(action => actionAppliesToEntity(action, instance, props.type?.id))
  .filter(action => !resolveActionButton(action, { render: props.type?.render, statePolicy: props.statePolicy }).hidden);
// SPEC §22.12: a relation-scoped section's linked cards carry the
// parent's unlink actions — the parent record and the row's relation
// ref travel as the run context.
const unlinkItemsFor = instance => (props.relationUnlink?.actions || [])
  .map(action => {
    const key = action.relationMutation?.key || action.relation?.key || '';
    const rowId = String(instance?._id || instance?.id || '');
    if (!key || !rowId) return null;
    return {
      label: generatedActionLabel(action, action.id, { t, te }),
      icon: 'pi pi-times',
      command: () => emit('run', action, {
        instance: props.relationUnlink.parent,
        data: { relations: { [key]: { type: props.type?.id, id: rowId } } }
      })
    };
  })
  .filter(Boolean);
const rowMenuTarget = instance => Boolean(cardActionsFor(instance).length || unlinkItemsFor(instance).length);
const cardMenuItems = computed(() => [
  ...cardActionsFor(menuInstance.value || {})
    .map(action => {
  const resolved = resolveActionButton(action, { render: props.type?.render, statePolicy: props.statePolicy });
  return {
    label: localizedLabel({ te, t }, actionLabelKey(action.id), resolved.label || action.label || action.id),
    icon: resolved.icon || undefined,
    command: () => emit('run', action, { instance: menuInstance.value })
  };
}),
  ...unlinkItemsFor(menuInstance.value || {})
]);
</script>
