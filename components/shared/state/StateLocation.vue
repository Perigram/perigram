<script setup>
import { computed } from 'vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import { normalizeStateLocation } from '~/utils/state-location.js';

const props = defineProps({
  entity: { type: Object, required: true }
});

const location = computed(() => normalizeStateLocation(props.entity));
</script>

<template>
  <div v-if="location" class="flex items-center justify-between gap-4 min-w-0 text-body">
    <small class="text-muted">{{ $t('common.location') }}</small>
    <TraceLink
      v-if="location.type === 'warehouse'"
      type="warehouse"
      :id="location.id"
      :label="location.label"
      class="min-w-0"
    />
    <span v-else class="truncate text-label" :title="location.label">
      {{ location.label }}
    </span>
  </div>
</template>
