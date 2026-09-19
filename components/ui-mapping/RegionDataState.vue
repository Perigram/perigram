<template>
  <Message v-if="text" :severity="severity" :text="text" />
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Message from 'primevue/message';

// Materializes the composed region dataState (see composeScreen): a
// ready region renders nothing here; loading/empty/missing/denied/error
// render the one shared message so every surface reports data state the
// same way. Error detail text travels beside the source state through
// the data layer, not through the region tree.
const props = defineProps({
  node: { type: Object, required: true }
});

const { t } = useI18n();

const MESSAGES = Object.freeze({
  loading: { severity: 'info', key: 'uiMapping.loadingRegion' },
  empty: { severity: 'info', key: 'uiMapping.emptyRegion' },
  missing: { severity: 'info', key: 'uiMapping.missingRegion' },
  denied: { severity: 'warn', key: 'uiMapping.deniedRegion' },
  error: { severity: 'error', key: 'uiMapping.errorRegion' }
});

const message = computed(() => MESSAGES[props.node.dataState] || null);
const severity = computed(() => message.value?.severity || 'info');
const text = computed(() => (message.value ? t(message.value.key) : ''));
</script>
