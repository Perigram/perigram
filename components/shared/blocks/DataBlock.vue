<template>
  <div v-if="visibleRows.length" class="data-block-container">
  <dl
    class="data-block m-0"
    :class="variant === 'compact' ? 'flex flex-wrap gap-x-4 gap-y-1 text-body' : 'data-block-default grid grid-cols-1 gap-3'"
  >
    <div
      v-for="row in visibleRows"
      :key="row.label"
      :class="variant === 'compact'
        ? 'inline-flex min-w-0 items-baseline gap-1.5'
        : 'min-w-0 rounded-ui border border-content-border px-3 py-2'"
    >
      <dt class="min-w-0 text-muted-color text-supporting">
        {{ row.label }}
      </dt>
      <dd
        class="m-0 min-w-0 break-words text-technical"
        :class="variant === 'compact' ? '' : 'mt-1'"
      >
        <span v-if="row.swatch" class="mr-1.5 inline-block h-3 w-3 shrink-0 rounded-ui align-middle" :style="{ backgroundColor: row.swatch }" />
        {{ row.display }}
      </dd>
    </div>
  </dl>
  </div>
</template>

<script setup>
/**
 * DataBlock - Standardized key/value data display.
 *
 * Usage:
 *   import { PEN_TEMPLATE_FIELDS } from '~/constants/entityFields'
 *   <DataBlock entity-type="penTemplate" :entity="pen" :fields="PEN_TEMPLATE_FIELDS" />
 *
 * Fields schema: Array of { path, i18n, suffix?, prefix? }
 * - path: dot-notation path into entity (e.g. 'stroke.color')
 * - i18n: translation key for label
 * - suffix/prefix: optional value decoration (e.g. suffix=' mm')
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { filterEntityFields } from '~/shared/entity-field-access.js';
import { decorateDataValue, resolveDataPath } from '~/utils/data-display.js';

const props = defineProps({
    entityType: { type: String, required: true },
    entity: { type: Object, required: true },
    accessEntity: { type: Object, default: null },
    fields: { type: Array, required: true },
    variant: { type: String, default: 'default' },
    fieldLimit: { type: Number, default: null }
});

const { t } = useI18n();
const authStore = useAuthStore();

const policyFields = computed(() => filterEntityFields({
    fields: props.fields,
    auth: { permissions: authStore.activePermissions, fieldPolicies: authStore.fieldPolicies },
    entity: props.accessEntity || props.entity,
    entityType: props.entityType
}));

const visibleRows = computed(() =>
    policyFields.value
        .map(field => {
            const raw = resolveFirstDisplayPath(props.entity, field);
            const display = decorateDataValue(raw, {
                ...field,
                trueLabel: t('common.yes'),
                falseLabel: t('common.no')
            });
            if (!display) return null;
            const swatch = field.display === 'swatch' && /^[0-9a-f]{3,8}$/i.test(String(raw).replace('#', ''))
                ? `#${String(raw).replace('#', '')}`
                : null;
            return { label: t(field.i18n), display, swatch };
        })
        .slice(0, props.fieldLimit || undefined)
        .filter(Boolean)
);

function resolveFirstDisplayPath(entity, field) {
    const paths = [field.path, ...(field.fallbackPaths || [])].filter(Boolean);
    for (const path of paths) {
        const value = resolveDataPath(entity, path);
        if (value !== null && value !== undefined && value !== '') return value;
    }
    return undefined;
}
</script>

<style scoped>
.data-block-container {
    container-type: inline-size;
}

@container (min-width: 32rem) {
    .data-block-default {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
