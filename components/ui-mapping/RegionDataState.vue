<template>
  <div v-if="isLoading" :class="stackClasses" aria-busy="true">
    <Skeleton width="42%" height="1.25rem" />
    <Skeleton width="100%" height="1rem" />
    <Skeleton width="78%" height="1rem" />
    <Skeleton width="91%" height="1rem" />
  </div>
  <Message v-else-if="text" :severity="severity">{{ text }}</Message>
</template>

<script setup>
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import { LAYOUT } from '#shared/ui-mapping/index.js';

// Materializes the composed region dataState (see composeScreen): a
// ready region renders nothing here; loading renders skeleton lines on
// the system stack rhythm (RegionBlock shows stale surfaces plus an
// indeterminate progress bar when instances are already loaded, so this
// skeleton only runs on the first load); empty/missing/denied/error
// render the one shared message so every surface reports data state the
// same way. Error detail text travels beside the source state through
// the data layer, not through the region tree.
const props = defineProps({
  node: { type: Object, required: true }
});

const { t } = useI18n();
const spacing = inject('uiMappingSpacing', null);
const stackClasses = computed(() => (spacing ? spacing.stackTight : LAYOUT.stackTight));

const MESSAGES = Object.freeze({
  empty: { severity: 'info', key: 'uiMapping.emptyRegion' },
  missing: { severity: 'info', key: 'uiMapping.missingRegion' },
  denied: { severity: 'warn', key: 'uiMapping.deniedRegion' },
  error: { severity: 'error', key: 'uiMapping.errorRegion' }
});

const isLoading = computed(() => props.node.dataState === 'loading');
const message = computed(() => MESSAGES[props.node.dataState] || null);
const severity = computed(() => message.value?.severity || 'info');
const text = computed(() => (message.value ? t(message.value.key) : ''));
</script>
