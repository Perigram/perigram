<template>
  <div :class="LAYOUT.ganttStack" data-testid="gantt-collection">
    <div :class="LAYOUT.ganttAxisRow">
      <div :class="LAYOUT.ganttAxisSpacer" />
      <div class="relative h-6 min-w-0 flex-1">
        <span
          v-for="tick in ticks"
          :key="tick.key"
          :style="tickStyle(tick)"
          class="absolute top-0 -translate-x-1/2 text-technical text-muted"
        >{{ tick.label }}</span>
        <span
          v-if="todayLeft !== null"
          :style="todayStyle"
          class="absolute inset-y-0 w-px bg-content-border"
          :title="$t('uiMapping.today')"
        />
      </div>
    </div>
    <div
      v-for="row in rows"
      :key="row.instance.id"
      :class="LAYOUT.ganttAxisRow"
      data-testid="gantt-row"
    >
      <div :class="LAYOUT.ganttIdentity">
        <InstanceIdentity
          :instance="row.instance"
          :type="type"
          :openable="openable"
          @open="target => $emit('open', target)"
        />
      </div>
      <div :class="LAYOUT.ganttTrack">
        <span
          v-if="row.bar"
          :style="barStyle(row.bar)"
          :class="[LAYOUT.ganttBar, barTone(row.instance)]"
          :title="barTitle(row)"
        />
        <span
          v-else-if="row.point"
          :style="pointStyle(row.point)"
          :class="['absolute inset-y-1 w-1.5 rounded-full', barTone(row.instance)]"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
// The durational projection: one row per instance over a shared instant
// scale — declared instants in declaration order are the interval (first
// start, second end; temporalFieldsFor), the pool's own min/max bounds
// the scale, and bars are data-driven geometry (the inline data-driven
// exception) painted by the state severity token classes. A start
// without an end renders a point, never a fabricated duration. The
// today marker rides the axis; month ticks label the scale. Identity
// links follow the shared onOpen navigation contract.
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { LAYOUT, titleFor, temporalFieldsFor, stateDisplayFor } from '#shared/ui-mapping/index.js';
import InstanceIdentity from './InstanceIdentity.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Collection identities render as links when an open handler exists.
  openable: { type: Boolean, default: false },
  // Per-type state policy map: bar tone follows the state severity.
  statePolicy: { type: Object, default: null }
});

defineEmits(['open']);

inject('uiMappingSpacing', null);
const { t, locale } = useI18n();

const temporal = computed(() => temporalFieldsFor(props.type || {}));

const rows = computed(() => {
  const { start, end } = temporal.value || {};
  if (!start) return [];
  const parsed = props.instances.map(instance => {
    const from = Date.parse(instance?.fields?.[start] || '');
    if (!Number.isFinite(from)) return null;
    const rawTo = end ? Date.parse(instance?.fields?.[end] || '') : NaN;
    const to = Number.isFinite(rawTo) ? rawTo : null;
    return { instance, from, to };
  }).filter(Boolean);
  parsed.sort((left, right) => left.from - right.from);
  const froms = parsed.map(row => row.from);
  const tos = parsed.map(row => row.to ?? row.from);
  const min = Math.min(...froms);
  const max = Math.max(...tos);
  const range = Math.max(max - min, 24 * 60 * 60 * 1000);
  return parsed.map(row => ({
    instance: row.instance,
    bar: row.to !== null && row.to > row.from ? { left: ((row.from - min) / range) * 100, width: ((row.to - row.from) / range) * 100 } : null,
    point: row.to === null || row.to <= row.from ? { left: ((row.from - min) / range) * 100 } : null
  }));
});

// Month ticks across the scale: first tick always renders, later ones
// only when they clear the previous label (dense scales drop labels, not
// structure). The today marker rides the axis when the scale spans now.
const monthFormatter = new Intl.DateTimeFormat(locale.value || undefined, { month: 'short' });
const ticks = computed(() => {
  const { start, end } = temporal.value || {};
  if (!start) return [];
  const values = props.instances.flatMap(instance => [
    Date.parse(instance?.fields?.[start] || ''),
    end ? Date.parse(instance?.fields?.[end] || '') : NaN
  ]).filter(Number.isFinite);
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values, min + 24 * 60 * 60 * 1000);
  const range = Math.max(max - min, 24 * 60 * 60 * 1000);
  const out = [];
  const cursor = new Date(min);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  for (; cursor.getTime() <= max; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const left = ((cursor.getTime() - min) / range) * 100;
    if (!out.length || left - out[out.length - 1].left >= 9) {
      out.push({ key: cursor.toISOString().slice(0, 7), label: monthFormatter.format(cursor), left });
    }
  }
  return out;
});
const todayLeft = computed(() => {
  const { start, end } = temporal.value || {};
  if (!start) return null;
  const values = props.instances.flatMap(instance => [
    Date.parse(instance?.fields?.[start] || ''),
    end ? Date.parse(instance?.fields?.[end] || '') : NaN
  ]).filter(Number.isFinite);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values, min + 24 * 60 * 60 * 1000);
  const range = Math.max(max - min, 24 * 60 * 60 * 1000);
  const now = Date.now();
  if (now < min || now > max) return null;
  return ((now - min) / range) * 100;
});

const tickStyle = tick => ({ left: `${tick.left}%` });
const todayStyle = computed(() => ({ left: `${todayLeft.value}%` }));
const barStyle = bar => ({ left: `${Math.max(0, bar.left)}%`, width: `${Math.max(1, Math.min(100 - bar.left, bar.width))}%` });
const pointStyle = point => ({ left: `${Math.max(0, Math.min(99, point.left))}%` });
const barTitle = row => titleFor(row.instance, props.type, { unnamedLabel: t('common.unnamed') });
// Bar tone: the state severity's status token class — data-decided
// color, never a raw palette.
const TONE_BY_SEVERITY = Object.freeze({
  info: 'bg-status-info',
  success: 'bg-status-success',
  warn: 'bg-status-warning',
  danger: 'bg-status-danger',
  secondary: 'bg-status-neutral'
});
const barTone = instance => TONE_BY_SEVERITY[stateDisplayFor(props.statePolicy, instance?.state)?.severity] || 'bg-status-neutral';
</script>
