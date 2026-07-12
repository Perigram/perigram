<template>
  <div class="flex min-h-0 flex-col gap-3">
    <ActionToolbar>
      <template #actions>
        <Tag :value="$t('sheetDesign.snapSize', { size: snapSize })" severity="secondary" size="small" />
        <Button icon="pi pi-plus" size="small" :disabled="!editable" :aria-label="$t('sheetDesign.addCassette')" v-tooltip.top="$t('sheetDesign.addCassette')" @click="openAddDialog" />
        <Button icon="pi pi-upload" severity="secondary" text rounded size="small" :disabled="!editable" :aria-label="$t('common.upload')" v-tooltip.top="$t('common.upload')" @click="uploadVisible = true" />
        <Button icon="pi pi-trash" severity="danger" text rounded size="small" :disabled="!editable || selectedIndex < 0" :aria-label="$t('common.delete')" v-tooltip.top="$t('common.delete')" @click="removeSelected" />
        <Button icon="pi pi-save" size="small" :loading="saving" :disabled="!editable || saving" :aria-label="$t('common.save')" v-tooltip.top="$t('common.save')" @click="save" />
      </template>
    </ActionToolbar>

    <div class="aspect-[3/2] min-h-72 overflow-hidden rounded-ui border border-content-border bg-content">
      <svg
        ref="svgRef"
        class="h-full w-full touch-none"
        :viewBox="`0 0 ${sheetWidth} ${sheetHeight}`"
        role="application"
        :aria-label="$t('sheetDesign.editor')"
        @pointermove="dragPlacement"
        @pointerup="finishDrag"
        @pointercancel="finishDrag"
        @keydown.esc.stop.prevent="selectedIndex = -1"
      >
        <defs>
          <pattern id="sheet-layout-grid" :width="snapSize" :height="snapSize" patternUnits="userSpaceOnUse">
            <path :d="`M ${snapSize} 0 L 0 0 0 ${snapSize}`" fill="none" stroke="currentColor" stroke-opacity="0.08" :stroke-width="Math.max(snapSize / 20, 0.2)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sheet-layout-grid)" />
        <g
          v-for="(placement, index) in placedItems"
          :key="placementKey(placement, index)"
          :transform="placementSvgTransform(placement)"
          class="cursor-move"
          tabindex="0"
          @pointerdown.stop="startDrag($event, index)"
          @focus="selectedIndex = index"
          @keydown.delete.stop.prevent="removePlacement(index)"
          @keydown.backspace.stop.prevent="removePlacement(index)"
        >
          <polygon
            :points="placementPoints(placement)"
            :fill="selectedIndex === index ? 'var(--p-primary-100)' : 'var(--p-surface-100)'"
            :stroke="selectedIndex === index ? 'var(--p-primary-color)' : 'var(--p-text-muted-color)'"
            vector-effect="non-scaling-stroke"
          />
        </g>
      </svg>
    </div>

    <StandardDialog v-model:visible="addVisible" :header="$t('sheetDesign.addCassette')" size="md">
      <Select
        v-model="selectedCassetteDesignId"
        :options="cassetteOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        :placeholder="$t('sheetDesign.selectCassette')"
      />
      <template #footer>
        <Button :label="$t('common.cancel')" severity="secondary" text size="small" @click="addVisible = false" />
        <Button :label="$t('common.add')" icon="pi pi-plus" size="small" :disabled="!selectedCassetteDesignId" @click="addSelectedCassette" />
      </template>
    </StandardDialog>

    <CassetteEditorDialog v-model="uploadVisible" @saved="addUploadedCassette" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import CassetteEditorDialog from '~/components/CassetteEditorDialog.vue';
import {
  cassetteDesignSheetItem,
  placementWithTranslation,
  sheetItemPoints,
  sheetLayoutState,
  sheetPlacementSource,
  sheetPlacementTransform,
  snapSheetCoordinate
} from '~/utils/sheetLayoutEditor.js';

const props = defineProps({
  design: { type: Object, required: true },
  editable: { type: Boolean, default: false }
});
const emit = defineEmits(['saved']);
const { t } = useI18n();
const toast = useToast();

const svgRef = ref(null);
const items = ref([]);
const placedItems = ref([]);
const selectedIndex = ref(-1);
const dragState = ref(null);
const saving = ref(false);
const addVisible = ref(false);
const uploadVisible = ref(false);
const cassetteDesigns = ref([]);
const selectedCassetteDesignId = ref('');

const sheetWidth = computed(() => Math.max(Number(props.design.specs?.width) || 1220, 1));
const sheetHeight = computed(() => Math.max(Number(props.design.specs?.length) || 2440, 1));
const snapSize = computed(() => Math.max(Number(
  props.design.data?.nestingParams?.spacing ||
  props.design.data?.nestingParams?.space ||
  props.design.data?.geometry?.data?.params?.space ||
  5
) || 5, 0.1));
const cassetteOptions = computed(() => cassetteDesigns.value.map(design => ({
  label: design.identity?.name || design.identity?.slug || design._id,
  value: design._id?.toString()
})));

function resetLayout() {
  const state = sheetLayoutState(props.design);
  items.value = state.items;
  placedItems.value = state.placedItems;
  selectedIndex.value = -1;
}

watch(() => props.design._id, resetLayout, { immediate: true });

function placementKey(placement, index) {
  return placement.id || `${placement.item_id ?? placement.itemId ?? 'item'}-${index}`;
}

function placementPoints(placement) {
  return sheetItemPoints(sheetPlacementSource(items.value, placement)).map(point => point.join(',')).join(' ');
}

function placementSvgTransform(placement) {
  const transform = sheetPlacementTransform(placement);
  return `translate(${transform.x} ${transform.y}) rotate(${transform.rotation})`;
}

function sheetPoint(event) {
  const matrix = svgRef.value?.getScreenCTM?.();
  if (!matrix) return { x: 0, y: 0 };
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

function startDrag(event, index) {
  if (!props.editable) return;
  const pointer = sheetPoint(event);
  const transform = sheetPlacementTransform(placedItems.value[index]);
  selectedIndex.value = index;
  dragState.value = { index, pointerId: event.pointerId, dx: pointer.x - transform.x, dy: pointer.y - transform.y };
  svgRef.value?.setPointerCapture?.(event.pointerId);
}

function dragPlacement(event) {
  const drag = dragState.value;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const pointer = sheetPoint(event);
  const x = Math.min(Math.max(snapSheetCoordinate(pointer.x - drag.dx, snapSize.value), 0), sheetWidth.value);
  const y = Math.min(Math.max(snapSheetCoordinate(pointer.y - drag.dy, snapSize.value), 0), sheetHeight.value);
  placedItems.value[drag.index] = placementWithTranslation(placedItems.value[drag.index], x, y);
}

function finishDrag(event) {
  if (dragState.value?.pointerId === event.pointerId) dragState.value = null;
}

function removePlacement(index) {
  if (!props.editable || index < 0) return;
  placedItems.value.splice(index, 1);
  selectedIndex.value = -1;
}

function removeSelected() {
  removePlacement(selectedIndex.value);
}

async function openAddDialog() {
  addVisible.value = true;
  if (!cassetteDesigns.value.length) {
    cassetteDesigns.value = await $fetch('/api/cassette-designs').catch(() => []);
  }
}

function addCassetteDesign(design) {
  if (!design?._id) return;
  const id = `manual-${design._id}-${Date.now()}-${items.value.length}`;
  const item = cassetteDesignSheetItem(design, id);
  if (!item) return;
  items.value.push(item);
  placedItems.value.push({
    item_id: id,
    transformation: { rotation: 0, translation: [snapSize.value, snapSize.value] }
  });
  selectedIndex.value = placedItems.value.length - 1;
}

function addSelectedCassette() {
  const design = cassetteDesigns.value.find(item => String(item._id) === String(selectedCassetteDesignId.value));
  addCassetteDesign(design);
  selectedCassetteDesignId.value = '';
  addVisible.value = false;
}

function addUploadedCassette(payload = {}) {
  const design = payload.design || payload;
  if (design?._id && !cassetteDesigns.value.some(item => String(item._id) === String(design._id))) {
    cassetteDesigns.value.unshift(design);
  }
  addCassetteDesign(design);
}

async function save() {
  saving.value = true;
  try {
    const saved = await $fetch(`/api/sheet-designs/${encodeURIComponent(props.design._id)}`, {
      method: 'PUT',
      body: { items: items.value, placedItems: placedItems.value }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('sheetDesign.layoutSaved'), life: 2500 });
    emit('saved', saved);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || t('sheetDesign.layoutSaveFailed'), life: 4000 });
  } finally {
    saving.value = false;
  }
}
</script>
