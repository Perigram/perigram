<template>
  <dl
    v-if="visibleRows.length"
    class="m-0"
    :class="variant === 'compact' ? 'flex flex-wrap gap-x-4 gap-y-1 text-sm' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'"
  >
    <div
      v-for="row in visibleRows"
      :key="row.label"
      :class="variant === 'compact'
        ? 'inline-flex min-w-0 items-baseline gap-1.5'
        : 'min-w-0 rounded-ui border border-content-border bg-content px-3 py-2'"
    >
      <dt class="min-w-0 text-xs text-muted-color">
        {{ row.label }}
      </dt>
      <dd
        class="m-0 min-w-0 break-words font-medium"
        :class="variant === 'compact' ? '' : 'mt-1'"
      >
        {{ row.display }}
      </dd>
    </div>
  </dl>
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
    variant: { type: String, default: 'default' }
});

const { t } = useI18n();
const authStore = useAuthStore();

const policyFields = computed(() => filterEntityFields({
    fields: props.fields,
    permissions: authStore.activePermissions,
    entity: props.accessEntity || props.entity,
    entityType: props.entityType
}));

const visibleRows = computed(() =>
    policyFields.value
        .map(field => {
            const raw = resolveDataPath(props.entity, field.path);
            const display = decorateDataValue(raw, {
                ...field,
                trueLabel: t('common.yes'),
                falseLabel: t('common.no')
            });
            if (!display) return null;
            return { label: t(field.i18n), display };
        })
        .filter(Boolean)
);
</script>
