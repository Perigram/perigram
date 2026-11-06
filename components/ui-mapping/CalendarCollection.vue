<template>
  <div :class="LAYOUT.calendarStack" data-testid="calendar-collection">
    <div :class="LAYOUT.calendarHead">
      <Button icon="pi pi-chevron-left" text rounded severity="secondary" :aria-label="$t('uiMapping.calendarPrev')" @click="shiftMonth(-1)" />
      <span class="text-section-heading">{{ monthLabel }}</span>
      <Button icon="pi pi-chevron-right" text rounded severity="secondary" :aria-label="$t('uiMapping.calendarNext')" @click="shiftMonth(1)" />
    </div>
    <div :class="LAYOUT.calendarGrid">
      <span
        v-for="day in weekdayLabels"
        :key="day"
        class="text-label text-muted"
      >{{ day }}</span>
      <div v-for="blank in leadingBlanks" :key="`blank-${blank}`" />
      <div
        v-for="cell in cells"
        :key="cell.key"
        :class="cell.today ? LAYOUT.calendarCellToday : LAYOUT.calendarCell"
        :aria-label="cell.key"
      >
        <span class="text-technical text-muted">{{ cell.day }}</span>
        <InstanceIdentity
          v-for="entry in cell.visible"
          :key="entry.id"
          :instance="entry"
          :type="type"
          :openable="openable"
          size="small"
          @open="target => $emit('open', target)"
        />
        <span v-if="cell.hidden" class="text-supporting text-muted">+{{ cell.hidden }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// The scheduled projection: a month grid over the type's lone declared
// instant (temporalFieldsFor start). Day cells are subtle wells; today's
// cell steps up to the content surface; instances render as capped
// identity chips with a plain overflow count (the day cell is a summary,
// not a list — the detail surface carries the record, and the summary
// chip carries no lineage trail). Month navigation
// is local view state; labels and weekday headers format through the
// active locale, and the month opens on the first loaded instance's
// month (or the current month for empty pools).
import { computed, provide, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { LAYOUT, temporalFieldsFor } from '#shared/ui-mapping/index.js';
import InstanceIdentity from './InstanceIdentity.vue';

provide('instanceCollectionCrossCut', false);

const CHIP_BUDGET = 3;

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Collection identities render as links when an open handler exists.
  openable: { type: Boolean, default: false }
});

defineEmits(['open']);

const { t, locale } = useI18n();

const temporal = computed(() => temporalFieldsFor(props.type || {}));

const monthFormatter = new Intl.DateTimeFormat(locale.value || undefined, { month: 'long', year: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat(locale.value || undefined, { weekday: 'short' });

const firstInstanceOf = value => {
  const { start } = temporal.value || {};
  const parsed = Date.parse(value || '');
  if (!start || !Number.isFinite(parsed)) return null;
  return parsed;
};
const seed = props.instances.map(instance => firstInstanceOf(instance?.fields?.[temporal.value?.start])).find(Number.isFinite);
const anchor = seed !== undefined ? new Date(seed) : new Date();
const month = ref(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)));
const shiftMonth = delta => {
  month.value = new Date(Date.UTC(month.value.getUTCFullYear(), month.value.getUTCMonth() + delta, 1));
};
const monthLabel = computed(() => monthFormatter.format(month.value));

// Monday-first weekday headers from one fixed sample week.
const weekdayLabels = computed(() => {
  const sample = Date.UTC(2024, 0, 1); // a Monday
  return Array.from({ length: 7 }, (_, index) => weekdayFormatter.format(new Date(sample + index * 86400000)));
});

const dayKey = value => new Date(value).toISOString().slice(0, 10);
const byDay = computed(() => {
  const { start } = temporal.value || {};
  if (!start) return new Map();
  const map = new Map();
  for (const instance of props.instances) {
    const parsed = firstInstanceOf(instance?.fields?.[start]);
    if (!Number.isFinite(parsed)) continue;
    const key = dayKey(parsed);
    const list = map.get(key) || [];
    list.push(instance);
    map.set(key, list);
  }
  return map;
});

const leadingBlanks = computed(() => (month.value.getUTCDay() + 6) % 7);
const daysInMonth = computed(() => new Date(Date.UTC(month.value.getUTCFullYear(), month.value.getUTCMonth() + 1, 0)).getUTCDate());
const todayKey = dayKey(Date.now());
const cells = computed(() => Array.from({ length: daysInMonth.value }, (_, index) => {
  const date = new Date(Date.UTC(month.value.getUTCFullYear(), month.value.getUTCMonth(), index + 1));
  const key = dayKey(date);
  const entries = byDay.value.get(key) || [];
  return {
    key,
    day: index + 1,
    today: key === todayKey,
    visible: entries.slice(0, CHIP_BUDGET),
    hidden: Math.max(0, entries.length - CHIP_BUDGET)
  };
}));
</script>
