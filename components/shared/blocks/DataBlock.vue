<template>
  <div class="grid grid-cols-1 gap-2">
    <div
      v-for="row in visibleRows"
      :key="row.label"
      class="flex items-center justify-between gap-4 border-b border-content-border pb-2 last:border-b-0 last:pb-0"
    >
      <small class="text-muted-color">{{ row.label }}</small>
      <span class="font-medium text-right">{{ row.display }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * DataBlock - Standardized key/value data display.
 *
 * Usage:
 *   import { PEN_TEMPLATE_FIELDS } from '~/constants/entityFields'
 *   <DataBlock :entity="pen" :fields="PEN_TEMPLATE_FIELDS" />
 *
 * Fields schema: Array of { path, i18n, suffix?, prefix? }
 * - path: dot-notation path into entity (e.g. 'stroke.color')
 * - i18n: translation key for label
 * - suffix/prefix: optional value decoration (e.g. suffix=' mm')
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
    entity: { type: Object, required: true },
    fields: { type: Array, required: true }
});

const { t } = useI18n();

/** Resolve a dot-notation path against an object */
const resolvePath = (obj, path) =>
    path.split('.').reduce((acc, key) => acc?.[key], obj);

const visibleRows = computed(() =>
    props.fields
        .map(field => {
            const raw = resolvePath(props.entity, field.path);
            if (raw == null || raw === '') return null;
            const display = `${field.prefix ?? ''}${raw}${field.suffix ?? ''}`;
            return { label: t(field.i18n), display };
        })
        .filter(Boolean)
);
</script>
