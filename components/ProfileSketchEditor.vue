<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div class="min-h-0 rounded-ui border border-content-border bg-subtle p-2">
        <div class="mb-2 flex flex-wrap gap-1">
          <Button
            v-for="mode in toolModes"
            :key="mode.value"
            :label="$t(mode.labelKey)"
            :icon="mode.icon"
            :severity="activeTool === mode.value ? 'primary' : 'secondary'"
            size="small"
            @click="activeTool = mode.value"
          />
        </div>
        <svg
          class="h-72 w-full rounded-ui bg-content"
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
          />
          <circle
            v-for="point in preview.points"
            :key="point.id"
            :cx="point.xValue"
            :cy="point.yValue"
            r="2.8"
            class="cursor-move"
            :fill="point.id === selectedPointId ? 'var(--p-primary-color)' : 'currentColor'"
            @pointerdown="event => startDrag(event, point)"
          />
        </svg>
      </div>

      <div class="flex min-h-0 flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <strong>{{ $t('cassette.v2.profileEditor.parameters') }}</strong>
          <Button icon="pi pi-plus" text rounded size="small" :aria-label="$t('common.add')" @click="addParameter" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div v-for="name in parameterNames" :key="name" class="flex flex-col gap-1">
            <label class="font-mono text-xs">{{ name }}</label>
            <CassetteExpressionEditor
              :model-value="localSketch.parameters[name]"
              :parameters="parameterScope"
              :parameter-names="parameterNames.filter(item => item !== name)"
              @update:model-value="value => updateParameter(name, value)"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-2 rounded-ui border border-content-border p-2">
        <div class="flex items-center justify-between gap-2">
          <strong>{{ $t('cassette.v2.profileEditor.points') }}</strong>
          <Button icon="pi pi-plus" text rounded size="small" :aria-label="$t('common.add')" @click="addPoint()" />
        </div>
        <div v-for="point in localSketch.points" :key="point.id" class="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <Button
            :label="point.id"
            :severity="point.id === selectedPointId ? 'primary' : 'secondary'"
            size="small"
            @click="selectedPointId = point.id"
          />
          <CassetteExpressionEditor
            :model-value="point.x"
            :parameters="parameterScope"
            :parameter-names="parameterNames"
            @update:model-value="value => updatePoint(point.id, { x: value })"
          />
          <CassetteExpressionEditor
            :model-value="point.y"
            :parameters="parameterScope"
            :parameter-names="parameterNames"
            @update:model-value="value => updatePoint(point.id, { y: value })"
          />
        </div>
      </div>

      <div class="flex min-w-0 flex-col gap-2 rounded-ui border border-content-border p-2">
        <div class="flex items-center justify-between gap-2">
          <strong>{{ $t('cassette.v2.profileEditor.holes') }}</strong>
          <Button icon="pi pi-plus" text rounded size="small" :aria-label="$t('common.add')" @click="addHole" />
        </div>
        <div v-for="hole in localSketch.holes" :key="hole.id" class="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <Button :label="hole.id" severity="secondary" size="small" />
          <CassetteExpressionEditor
            :model-value="hole.center[0]"
            :parameters="parameterScope"
            :parameter-names="parameterNames"
            @update:model-value="value => updateHole(hole.id, { center: [value, hole.center[1]] })"
          />
          <CassetteExpressionEditor
            :model-value="hole.center[1]"
            :parameters="parameterScope"
            :parameter-names="parameterNames"
            @update:model-value="value => updateHole(hole.id, { center: [hole.center[0], value] })"
          />
          <CassetteExpressionEditor
            :model-value="hole.diameter"
            :parameters="parameterScope"
            :parameter-names="parameterNames"
            @update:model-value="value => updateHole(hole.id, { diameter: value })"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-color">{{ $t('cassette.v2.profileEditor.filletRadius') }}</label>
          <CassetteExpressionEditor
            :model-value="filletRadius"
            :parameters="parameterScope"
            :parameter-names="parameterNames"
            @update:model-value="updateFilletRadius"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import CassetteExpressionEditor from '~/components/CassetteExpressionEditor.vue';
import {
  evaluateOccsProfileSketchPreview,
  normalizeOccsProfileSketch,
  occsProfileFromSketch
} from '../utils/occs/profiles.js';

const props = defineProps({
  modelValue: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['update:modelValue', 'profile']);

const localSketch = ref(normalizeOccsProfileSketch(props.modelValue || {}));
const selectedPointId = ref(localSketch.value.points[0]?.id || '');
const draggingPointId = ref('');
const dragPoint = ref(null);
const activeTool = ref('select');

const toolModes = [
  { value: 'select', labelKey: 'cassette.v2.profileEditor.tools.select', icon: 'pi pi-arrow-up-left' },
  { value: 'point', labelKey: 'cassette.v2.profileEditor.tools.point', icon: 'pi pi-circle' },
  { value: 'hole', labelKey: 'cassette.v2.profileEditor.tools.hole', icon: 'pi pi-dot-circle' }
];

const parameterNames = computed(() => Object.keys(localSketch.value.parameters || {}).sort());
const parameterScope = computed(() => ({ ...(localSketch.value.parameters || {}) }));
const displaySketch = computed(() => {
  if (!draggingPointId.value || !dragPoint.value) return localSketch.value;
  return {
    ...localSketch.value,
    points: localSketch.value.points.map(point => (
      point.id === draggingPointId.value
        ? { ...point, x: String(dragPoint.value[0]), y: String(dragPoint.value[1]) }
        : point
    ))
  };
});
const preview = computed(() => evaluateOccsProfileSketchPreview(displaySketch.value));
const sectionPath = computed(() => {
  const points = preview.value.points;
  if (!points.length) return '';
  const [first, ...rest] = points;
  return [
    `M ${first.xValue} ${first.yValue}`,
    ...rest.map(point => `L ${point.xValue} ${point.yValue}`),
    'Z'
  ].join(' ');
});
const viewBox = computed(() => {
  const points = preview.value.points;
  const holes = preview.value.holes || [];
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
  return `${minX - padding} ${minY - padding} ${Math.max(1, maxX - minX + padding * 2)} ${Math.max(1, maxY - minY + padding * 2)}`;
});
const filletRadius = computed(() => localSketch.value.modifiers?.find(modifier => modifier.type === 'fillet')?.radius || '0');

watch(() => props.modelValue, (value) => {
  localSketch.value = normalizeOccsProfileSketch(value || {});
  selectedPointId.value = localSketch.value.points[0]?.id || '';
}, { deep: true });

watch(localSketch, () => {
  const normalized = normalizeOccsProfileSketch(localSketch.value);
  emit('update:modelValue', normalized);
  emit('profile', occsProfileFromSketch(normalized));
}, { deep: true });

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

const addParameter = () => {
  const index = parameterNames.value.length + 1;
  updateLocalSketch((next) => {
    next.parameters[`P${index}`] = '0';
  });
};

const updateParameter = (name, value) => {
  updateLocalSketch((next) => {
    next.parameters[name] = value;
    next.sketch = undefined;
  });
};

const addPoint = (coords = null) => {
  updateLocalSketch((next) => {
    const id = `p${next.points.length}`;
    next.points.push({
      id,
      x: coords ? String(coords[0]) : '0',
      y: coords ? String(coords[1]) : '0'
    });
    next.edges = rebuildClosedLineEdges(next.points);
    next.modifiers = next.modifiers.map(modifier => (
      modifier.type === 'fillet'
        ? { ...modifier, vertices: next.points.map(point => point.id) }
        : modifier
    ));
    selectedPointId.value = id;
  });
};

const addHole = (coords = null) => {
  updateLocalSketch((next) => {
    next.holes.push({
      id: `h${next.holes.length}`,
      type: 'circle',
      center: coords ? [String(coords[0]), String(coords[1])] : ['W / 2', 'H / 2'],
      diameter: 'D'
    });
  });
};

const updatePoint = (id, patch) => {
  updateLocalSketch((next) => {
    const point = next.points.find(item => item.id === id);
    if (point) Object.assign(point, patch);
  });
};

const updateHole = (id, patch) => {
  updateLocalSketch((next) => {
    const hole = next.holes.find(item => item.id === id);
    if (hole) Object.assign(hole, patch);
  });
};

const updateFilletRadius = (radius) => {
  updateLocalSketch((next) => {
    const vertices = next.points.map(point => point.id);
    const fillet = next.modifiers.find(modifier => modifier.type === 'fillet');
    if (fillet) fillet.radius = radius;
    else next.modifiers.push({ type: 'fillet', vertices, radius });
  });
};

const svgPointFromEvent = (event) => {
  const svg = event.currentTarget.closest('svg') || event.currentTarget;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
  return [Math.round(transformed.x * 10) / 10, Math.round(transformed.y * 10) / 10];
};

const startDrag = (event, point) => {
  event.stopPropagation();
  event.preventDefault();
  if (activeTool.value !== 'select') return;
  selectedPointId.value = point.id;
  draggingPointId.value = point.id;
  dragPoint.value = [point.xValue, point.yValue];
};

const handleCanvasPointerDown = (event) => {
  if (event.target?.tagName?.toLowerCase?.() !== 'svg') return;
  const coords = svgPointFromEvent(event);
  if (activeTool.value === 'point') {
    addPoint(coords);
    return;
  }
  if (activeTool.value === 'hole') {
    addHole(coords);
  }
};

const handlePointerMove = (event) => {
  if (!draggingPointId.value) return;
  dragPoint.value = svgPointFromEvent(event);
};

const stopDrag = () => {
  if (draggingPointId.value && dragPoint.value) {
    updatePoint(draggingPointId.value, {
      x: String(dragPoint.value[0]),
      y: String(dragPoint.value[1])
    });
  }
  draggingPointId.value = '';
  dragPoint.value = null;
};
</script>
