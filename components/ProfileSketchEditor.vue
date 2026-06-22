<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="min-h-0 rounded-ui border border-content-border bg-subtle p-2">
        <div class="mb-2 flex flex-wrap items-center gap-1">
          <Button
            v-for="mode in toolModes"
            :key="mode.value"
            :label="$t(mode.labelKey)"
            :icon="mode.icon"
            :severity="activeTool === mode.value ? 'primary' : 'secondary'"
            size="small"
            @click="activeTool = mode.value"
          />
          <Button
            icon="pi pi-upload"
            :label="$t('cassette.v2.profileEditor.importDxf')"
            severity="secondary"
            size="small"
            @click="fileInputRef?.click()"
          />
          <input
            ref="fileInputRef"
            type="file"
            accept=".dxf"
            class="hidden"
            @change="handleDxfUpload"
          />
        </div>

        <svg
          class="h-[28rem] w-full rounded-ui bg-content"
          :viewBox="viewBox"
          role="img"
          :aria-label="$t('cassette.v2.profileEditor.preview')"
          @pointerdown="handleCanvasPointerDown"
          @pointermove="handlePointerMove"
          @pointerup="stopDrag"
          @pointerleave="stopDrag"
        >
          <path
            v-if="sectionPath"
            :d="sectionPath"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <circle
            v-for="hole in preview.holes"
            :key="hole.id"
            :cx="hole.centerValue[0]"
            :cy="hole.centerValue[1]"
            :r="hole.diameterValue / 2"
            fill="none"
            stroke="currentColor"
            stroke-dasharray="3 2"
            stroke-width="1"
            @pointerdown.stop="selectHole(hole.id)"
          />
          <circle
            v-for="point in preview.points"
            :key="point.id"
            :cx="point.xValue"
            :cy="point.yValue"
            r="3.2"
            class="cursor-move"
            :fill="point.id === selectedPointId ? 'var(--p-primary-color)' : 'currentColor'"
            @pointerdown="event => startDrag(event, point)"
          />
          <circle
            v-if="snapPoint"
            :cx="snapPoint[0]"
            :cy="snapPoint[1]"
            r="5"
            fill="none"
            stroke="var(--p-primary-color)"
            stroke-width="1"
          />
        </svg>
      </div>

      <div class="flex min-h-0 flex-col gap-3">
        <div class="flex flex-col gap-2 rounded-ui border border-content-border p-2">
          <strong>{{ $t('cassette.v2.profileEditor.selection') }}</strong>
          <template v-if="selectedPoint">
            <small class="text-muted-color">{{ selectedPoint.id }}</small>
            <div class="grid grid-cols-2 gap-2">
              <InputNumber
                :model-value="selectedPoint.x"
                input-class="w-full"
                :min-fraction-digits="0"
                :max-fraction-digits="3"
                @update:model-value="value => updatePoint(selectedPoint.id, { x: value })"
              />
              <InputNumber
                :model-value="selectedPoint.y"
                input-class="w-full"
                :min-fraction-digits="0"
                :max-fraction-digits="3"
                @update:model-value="value => updatePoint(selectedPoint.id, { y: value })"
              />
            </div>
          </template>
          <template v-else-if="selectedHole">
            <small class="text-muted-color">{{ selectedHole.id }}</small>
            <div class="grid grid-cols-2 gap-2">
              <InputNumber
                :model-value="selectedHole.center[0]"
                input-class="w-full"
                :min-fraction-digits="0"
                :max-fraction-digits="3"
                @update:model-value="value => updateHole(selectedHole.id, { center: [value, selectedHole.center[1]] })"
              />
              <InputNumber
                :model-value="selectedHole.center[1]"
                input-class="w-full"
                :min-fraction-digits="0"
                :max-fraction-digits="3"
                @update:model-value="value => updateHole(selectedHole.id, { center: [selectedHole.center[0], value] })"
              />
              <InputNumber
                :model-value="selectedHole.diameter"
                input-class="w-full"
                :min="0"
                :min-fraction-digits="0"
                :max-fraction-digits="3"
                @update:model-value="value => updateHole(selectedHole.id, { diameter: value })"
              />
            </div>
          </template>
          <small v-else class="text-muted-color">{{ $t('cassette.v2.profileEditor.noSelection') }}</small>
        </div>

        <div class="flex flex-col gap-2 rounded-ui border border-content-border p-2">
          <strong>{{ $t('cassette.v2.profileEditor.polyline') }}</strong>
          <div class="flex items-center gap-2">
            <label class="min-w-28 text-sm text-muted-color">{{ $t('cassette.v2.profileEditor.filletRadius') }}</label>
            <InputNumber
              :model-value="filletRadius"
              input-class="w-full"
              :min="0"
              :min-fraction-digits="0"
              :max-fraction-digits="3"
              @update:model-value="updateFilletRadius"
            />
          </div>
          <div class="flex flex-wrap gap-1">
            <Button icon="pi pi-plus" :label="$t('cassette.v2.profileEditor.addPoint')" severity="secondary" size="small" @click="addPoint()" />
            <Button icon="pi pi-circle" :label="$t('cassette.v2.profileEditor.addCircle')" severity="secondary" size="small" @click="addHole()" />
          </div>
        </div>

        <Message v-if="importError" severity="error" size="small" :closable="false">
          {{ importError }}
        </Message>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import {
  evaluateOccsProfileSketchPreview,
  normalizeOccsProfileSketch,
  occsProfileFromSketch,
  profileSketchFromDxfText
} from '~/utils/occs/profiles.js';

const props = defineProps({
  modelValue: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['update:modelValue', 'profile']);
const { t } = useI18n();

const localSketch = ref(normalizeOccsProfileSketch(props.modelValue || {}));
const selectedPointId = ref(localSketch.value.points[0]?.id || '');
const selectedHoleId = ref('');
const draggingPointId = ref('');
const dragPoint = ref(null);
const activeTool = ref('select');
const pointerPoint = ref(null);
const fileInputRef = ref(null);
const importError = ref('');

const toolModes = [
  { value: 'select', labelKey: 'cassette.v2.profileEditor.tools.select', icon: 'pi pi-arrow-up-left' },
  { value: 'polyline', labelKey: 'cassette.v2.profileEditor.tools.polyline', icon: 'pi pi-share-alt' },
  { value: 'circle', labelKey: 'cassette.v2.profileEditor.tools.circle', icon: 'pi pi-circle' }
];

const displaySketch = computed(() => {
  if (!draggingPointId.value || !dragPoint.value) return localSketch.value;
  return {
    ...localSketch.value,
    points: localSketch.value.points.map(point => (
      point.id === draggingPointId.value
        ? { ...point, x: dragPoint.value[0], y: dragPoint.value[1] }
        : point
    ))
  };
});
const preview = computed(() => evaluateOccsProfileSketchPreview(displaySketch.value));
const selectedPoint = computed(() => localSketch.value.points.find(point => point.id === selectedPointId.value) || null);
const selectedHole = computed(() => localSketch.value.holes.find(hole => hole.id === selectedHoleId.value) || null);
const snapPoint = computed(() => {
  if (!pointerPoint.value || draggingPointId.value) return null;
  const snap = nearestSnapPoint(pointerPoint.value);
  return snap?.distance <= snapThreshold.value ? [snap.point.xValue, snap.point.yValue] : null;
});
const snapThreshold = computed(() => {
  const [, , width, height] = viewBox.value.split(' ').map(Number);
  return Math.max(width, height) / 60 || 5;
});
const sectionPath = computed(() => {
  const points = preview.value.points;
  if (!points.length) return '';
  const radius = Math.max(0, Number(filletRadius.value || 0));
  if (radius > 0 && points.length >= 3) return roundedClosedPolylinePath(points, radius);
  const [first, ...rest] = points;
  return [
    `M ${first.xValue} ${first.yValue}`,
    ...rest.map(point => `L ${point.xValue} ${point.yValue}`),
    'Z'
  ].join(' ');
});
const viewBox = computed(() => {
  const stablePreview = evaluateOccsProfileSketchPreview(localSketch.value);
  const points = stablePreview.points;
  const holes = stablePreview.holes || [];
  const xs = points.flatMap(point => [point.xValue]).concat(holes.flatMap(hole => [
    hole.centerValue[0] - hole.diameterValue / 2,
    hole.centerValue[0] + hole.diameterValue / 2
  ]));
  const ys = points.flatMap(point => [point.yValue]).concat(holes.flatMap(hole => [
    hole.centerValue[1] - hole.diameterValue / 2,
    hole.centerValue[1] + hole.diameterValue / 2
  ]));
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 100);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 100);
  const padding = Math.max(10, (maxX - minX + maxY - minY) / 12);
  return `${xOrZero(minX - padding)} ${xOrZero(minY - padding)} ${Math.max(1, maxX - minX + padding * 2)} ${Math.max(1, maxY - minY + padding * 2)}`;
});
const filletRadius = computed(() => localSketch.value.modifiers?.find(modifier => modifier.type === 'fillet')?.radius || 0);

watch(() => props.modelValue, (value) => {
  const normalized = normalizeOccsProfileSketch(value || {});
  if (JSON.stringify(normalized) === JSON.stringify(normalizeOccsProfileSketch(localSketch.value))) return;
  localSketch.value = normalized;
  if (selectedPointId.value && !localSketch.value.points.some(point => point.id === selectedPointId.value)) {
    selectedPointId.value = localSketch.value.points[0]?.id || '';
  }
  if (selectedHoleId.value && !localSketch.value.holes.some(hole => hole.id === selectedHoleId.value)) {
    selectedHoleId.value = '';
  }
}, { deep: true });

watch(localSketch, () => {
  const normalized = normalizeOccsProfileSketch(localSketch.value);
  emit('update:modelValue', normalized);
  emit('profile', occsProfileFromSketch(normalized));
}, { deep: true });

const xOrZero = value => (Number.isFinite(value) ? value : 0);
const round = value => Math.round(Number(value || 0) * 1000) / 1000;
const pointAtDistance = (from, to, distance) => {
  const length = Math.hypot(to.xValue - from.xValue, to.yValue - from.yValue);
  if (!length) return [from.xValue, from.yValue];
  const ratio = Math.min(distance, length / 2) / length;
  return [
    from.xValue + (to.xValue - from.xValue) * ratio,
    from.yValue + (to.yValue - from.yValue) * ratio
  ];
};

const roundedClosedPolylinePath = (points, radius) => {
  const corners = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const start = pointAtDistance(point, previous, radius);
    const end = pointAtDistance(point, next, radius);
    return { point, start, end };
  });
  const [first, ...rest] = corners;
  return [
    `M ${first.end[0]} ${first.end[1]}`,
    ...rest.flatMap(corner => [
      `L ${corner.start[0]} ${corner.start[1]}`,
      `Q ${corner.point.xValue} ${corner.point.yValue} ${corner.end[0]} ${corner.end[1]}`
    ]),
    `L ${first.start[0]} ${first.start[1]}`,
    `Q ${first.point.xValue} ${first.point.yValue} ${first.end[0]} ${first.end[1]}`,
    'Z'
  ].join(' ');
};

const updateLocalSketch = (updater) => {
  const next = normalizeOccsProfileSketch(localSketch.value);
  updater(next);
  localSketch.value = normalizeOccsProfileSketch(next);
};

const rebuildClosedLineEdges = (points = []) => points.map((point, index) => ({
  id: `e${index}`,
  type: 'line',
  from: point.id,
  to: points[(index + 1) % points.length]?.id || point.id
})).filter(edge => edge.from !== edge.to);

const addPoint = (coords = null) => {
  const target = coords || [0, 0];
  updateLocalSketch((next) => {
    const id = `p${next.points.length}`;
    next.points.push({ id, x: round(target[0]), y: round(target[1]) });
    next.edges = rebuildClosedLineEdges(next.points);
    next.modifiers = next.modifiers.map(modifier => (
      modifier.type === 'fillet'
        ? { ...modifier, vertices: next.points.map(point => point.id) }
        : modifier
    ));
    selectedPointId.value = id;
    selectedHoleId.value = '';
  });
};

const addHole = (coords = null) => {
  const target = coords || [0, 0];
  updateLocalSketch((next) => {
    const id = `h${next.holes.length}`;
    next.holes.push({
      id,
      type: 'circle',
      center: [round(target[0]), round(target[1])],
      diameter: 6
    });
    selectedHoleId.value = id;
    selectedPointId.value = '';
  });
};

const updatePoint = (id, patch) => {
  updateLocalSketch((next) => {
    const point = next.points.find(item => item.id === id);
    if (point) Object.assign(point, {
      ...patch,
      ...(patch.x !== undefined ? { x: round(patch.x) } : {}),
      ...(patch.y !== undefined ? { y: round(patch.y) } : {})
    });
  });
};

const updateHole = (id, patch) => {
  updateLocalSketch((next) => {
    const hole = next.holes.find(item => item.id === id);
    if (!hole) return;
    if (patch.center) patch.center = patch.center.map(round);
    if (patch.diameter !== undefined) patch.diameter = Math.max(0, round(patch.diameter));
    Object.assign(hole, patch);
  });
};

const updateFilletRadius = (radius) => {
  updateLocalSketch((next) => {
    const vertices = next.points.map(point => point.id);
    const fillet = next.modifiers.find(modifier => modifier.type === 'fillet');
    if (fillet) fillet.radius = Math.max(0, round(radius));
    else next.modifiers.push({ type: 'fillet', vertices, radius: Math.max(0, round(radius)) });
  });
};

const svgPointFromEvent = (event) => {
  const svg = event.currentTarget.closest('svg') || event.currentTarget;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
  return [round(transformed.x), round(transformed.y)];
};

const nearestSnapPoint = (coords) => {
  const points = preview.value.points;
  if (!points.length) return null;
  return points
    .map(point => ({
      point,
      distance: Math.hypot(point.xValue - coords[0], point.yValue - coords[1])
    }))
    .sort((left, right) => left.distance - right.distance)[0] || null;
};

const snappedCoords = (coords) => {
  const snap = nearestSnapPoint(coords);
  return snap?.distance <= snapThreshold.value
    ? [snap.point.xValue, snap.point.yValue]
    : coords;
};

const selectHole = (holeId) => {
  selectedHoleId.value = holeId;
  selectedPointId.value = '';
};

const startDrag = (event, point) => {
  event.stopPropagation();
  event.preventDefault();
  if (activeTool.value !== 'select') return;
  selectedPointId.value = point.id;
  selectedHoleId.value = '';
  draggingPointId.value = point.id;
  dragPoint.value = [point.xValue, point.yValue];
};

const handleCanvasPointerDown = (event) => {
  if (event.target?.tagName?.toLowerCase?.() !== 'svg') return;
  const coords = snappedCoords(svgPointFromEvent(event));
  if (activeTool.value === 'polyline') {
    addPoint(coords);
    return;
  }
  if (activeTool.value === 'circle') {
    addHole(coords);
  }
};

const handlePointerMove = (event) => {
  const coords = svgPointFromEvent(event);
  pointerPoint.value = coords;
  if (!draggingPointId.value) return;
  dragPoint.value = snappedCoords(coords);
};

const stopDrag = () => {
  if (draggingPointId.value && dragPoint.value) {
    updatePoint(draggingPointId.value, {
      x: dragPoint.value[0],
      y: dragPoint.value[1]
    });
  }
  draggingPointId.value = '';
  dragPoint.value = null;
};

const handleDxfUpload = async (event) => {
  const [file] = Array.from(event.target.files || []);
  event.target.value = '';
  if (!file) return;
  importError.value = '';
  try {
    const text = await file.text();
    localSketch.value = profileSketchFromDxfText(text);
    selectedPointId.value = localSketch.value.points[0]?.id || '';
    selectedHoleId.value = '';
  } catch (error) {
    importError.value = error?.message || t('cassette.v2.profileEditor.importFailed');
  }
};
</script>
