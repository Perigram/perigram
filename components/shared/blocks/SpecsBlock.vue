<script setup>
/**
 * SpecsBlock - v24 Standardized
 * Displays physical dimensions, thickness, and area.
 */
import { computed, toRef } from 'vue';
import { useSpecs } from '~/composables/useBlocks';
import { useAuthStore } from '~/stores/auth';
import { canDisplayEntityField } from '~/shared/entity-field-access.js';

const props = defineProps({
  entityType: { type: String, required: true },
  entity: { type: Object, required: true },
  accessEntity: { type: Object, default: null },
  variant: { type: String, default: 'default' } // default, compact
});

const authStore = useAuthStore();
const { specs, formattedDimensions, formattedArea } = useSpecs(toRef(props, 'entity'));

const canDisplayPath = (path) => canDisplayEntityField({
  auth: { permissions: authStore.activePermissions, fieldPolicies: authStore.fieldPolicies },
  entity: props.accessEntity || props.entity,
  entityType: props.entityType,
  path
});

const canDisplayDimensions = computed(() =>
  canDisplayPath('specs.width') || canDisplayPath('data.specs.width')
);

const metricRows = computed(() => [
  specs.value.sheetThickness && (canDisplayPath('specs.sheetThickness') || canDisplayPath('data.specs.sheetThickness'))
    ? { key: 'sheetThickness', label: 'catalog.sheetThickness', value: `${specs.value.sheetThickness} mm` }
    : null,
  specs.value.foilThickness && (canDisplayPath('specs.foilThickness') || canDisplayPath('data.specs.foilThickness'))
    ? { key: 'foilThickness', label: 'catalog.foilThickness', value: `${specs.value.foilThickness} mm` }
    : null,
  specs.value.area && (canDisplayPath('specs.area') || canDisplayPath('data.specs.area'))
    ? { key: 'area', label: 'common.area', value: formattedArea.value }
    : null
].filter(Boolean));

const hasSpecs = computed(() => Boolean((canDisplayDimensions.value && formattedDimensions.value) || metricRows.value.length));
</script>

<template>
  <div v-if="hasSpecs" class="specs-block min-w-0">
    <!-- Compact Variant -->
    <template v-if="variant === 'compact'">
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-color">
            <span v-if="canDisplayDimensions && formattedDimensions" class="font-medium">{{ formattedDimensions }}</span>
            <span v-for="row in metricRows" :key="row.key">{{ row.value }}</span>
        </div>
    </template>

    <!-- Default Variant -->
    <template v-else>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div v-if="canDisplayDimensions && formattedDimensions" class="min-w-0 rounded-ui border border-content-border bg-content px-3 py-3">
                <small class="text-muted-color">{{ $t('catalog.dimensions') }}</small>
                <div class="mt-1 break-words font-semibold">{{ formattedDimensions }}</div>
            </div>
            <dl v-if="metricRows.length" class="m-0 grid min-w-0 grid-cols-1 gap-2">
                <div
                    v-for="row in metricRows"
                    :key="row.key"
                    class="flex min-w-0 items-center justify-between gap-3 rounded-ui border border-content-border px-3 py-2"
                >
                    <dt class="min-w-0 text-xs text-muted-color">{{ $t(row.label) }}</dt>
                    <dd class="m-0 min-w-0 break-words text-right font-medium">{{ row.value }}</dd>
                </div>
            </dl>
        </div>
    </template>
  </div>
</template>
