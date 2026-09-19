<script setup>
import Button from 'primevue/button';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import { useInstancesStore } from '~/stores/instances';

const props = defineProps({
  source: { type: Object, required: true }
});

const emit = defineEmits(['remove']);
const { t } = useI18n();
const instances = useInstancesStore();

const ENTITY_TYPE_BY_SOURCE = {
  PILE: 'materialPile',
  SHEET: 'sheet',
  REMNANT: 'remnant'
};

const entityType = computed(() => ENTITY_TYPE_BY_SOURCE[props.source.type] || null);
const entity = computed(() => props.source.entity || {
  _id: props.source.id || props.source.uniqueId,
  identity: { name: props.source.label },
  data: {}
});
const icon = computed(() => instances.iconFor(entityType.value));
const dimensions = computed(() => props.source.dimensions || {});
const width = computed(() => Number(dimensions.value.width || dimensions.value.w || 0));
const length = computed(() => Number(dimensions.value.length || dimensions.value.height || dimensions.value.h || 0));
const dimensionLabel = computed(() => (
  width.value > 0 && length.value > 0
    ? `${width.value} x ${length.value} mm`
    : (props.source.specs || t('common.notAvailable'))
));
const availableCount = computed(() => Number(props.source.availableCount ?? props.source.available ?? 1));
const availableLabel = computed(() => `${availableCount.value || 1} ${t('common.units')}`);
const typeLabel = computed(() => ({
  PILE: t('entities.materialPile'),
  SHEET: t('entities.sheet'),
  REMNANT: t('entities.remnant'),
  CUSTOM: t('nesting.custom')
}[props.source.type] || props.source.type || t('common.source')));
const geometryData = computed(() => (
  props.source.geometryData ||
  props.source.entity?.data?.geometry ||
  props.source.entity?.data?.geometryData ||
  props.source.entity?.geometry ||
  null
));

const normalizeRing = (points = []) => {
  if (!Array.isArray(points)) return [];
  const normalized = points
    .map(point => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
    .filter(point => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (normalized.length < 3) return [];

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (Math.abs(first[0] - last[0]) > 0.001 || Math.abs(first[1] - last[1]) > 0.001) {
    normalized.push([...first]);
  }
  return normalized;
};
const ringPath = (points = []) => points
  .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`)
  .join(' ');
const polygon = computed(() => {
  const sourcePolygon = props.source.sheetPolygon ||
    geometryData.value?.polygon ||
    geometryData.value?.sheetPolygon ||
    geometryData.value?.sheet_polygon ||
    props.source.entity?.data?.geometry?.data?.polygon ||
    props.source.entity?.data?.geometry?.polygon ||
    null;

  if (!sourcePolygon) return null;
  const outer = normalizeRing(sourcePolygon.outer || sourcePolygon.data?.outer || sourcePolygon);
  if (outer.length < 3) return null;

  return {
    outer,
    inner: (sourcePolygon.inner || sourcePolygon.data?.inner || [])
      .map(normalizeRing)
      .filter(ring => ring.length >= 3)
  };
});
const previewPoints = computed(() => {
  if (polygon.value) return [polygon.value.outer, ...polygon.value.inner].flat();
  const previewWidth = width.value > 0 ? width.value : 100;
  const previewLength = length.value > 0 ? length.value : 60;
  return [[0, 0], [previewWidth, 0], [previewWidth, previewLength], [0, previewLength]];
});
const previewBounds = computed(() => {
  const xs = previewPoints.value.map(point => Number(point[0]));
  const ys = previewPoints.value.map(point => Number(point[1]));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const boundsWidth = Math.max(maxX - minX, 1);
  const boundsHeight = Math.max(maxY - minY, 1);
  const padding = Math.max(boundsWidth, boundsHeight) * 0.06;
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: boundsWidth + padding * 2,
    height: boundsHeight + padding * 2
  };
});
const previewViewBox = computed(() => {
  const bounds = previewBounds.value;
  return `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;
});
const previewPath = computed(() => {
  if (polygon.value) {
    return [ringPath(polygon.value.outer), ...polygon.value.inner.map(ringPath)].join(' ');
  }
  const previewWidth = width.value > 0 ? width.value : 100;
  const previewLength = length.value > 0 ? length.value : 60;
  return `M 0 0 L ${previewWidth} 0 L ${previewWidth} ${previewLength} L 0 ${previewLength} Z`;
});
</script>

<template>
  <article class="flex min-h-0 flex-col overflow-hidden rounded-panel border border-content-border">
    <div class="flex h-20 items-center justify-center border-b border-content-border bg-subtle p-2">
      <svg class="h-full w-full text-[var(--p-text-color)]" :viewBox="previewViewBox" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path
          :d="previewPath"
          fill="currentColor"
          fill-opacity="0.08"
          fill-rule="evenodd"
          stroke="currentColor"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </div>

    <div class="flex min-h-0 flex-col gap-2 p-2.5">
      <div class="flex min-w-0 items-center justify-between gap-2">
        <IdentityBlock :entity="entity" variant="compact" :icon="icon" />
        <Button
          icon="pi pi-times"
          rounded
          text
          severity="danger"
          size="small"
          :aria-label="$t('common.delete')"
          @click.stop="emit('remove', source)"
        />
      </div>
      <div class="flex min-w-0 items-center justify-between gap-2 text-muted">
        <span class="truncate">{{ typeLabel }}</span>
        <span class="shrink-0">{{ availableLabel }}</span>
      </div>
      <span class="truncate">{{ dimensionLabel }}</span>
    </div>
  </article>
</template>
