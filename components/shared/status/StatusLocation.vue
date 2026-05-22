<script setup>
import { computed } from 'vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import { normalizeStatusLocation } from '~/utils/status-location.js';

const props = defineProps({
  entity: { type: Object, required: true }
});

const location = computed(() => normalizeStatusLocation(props.entity));
</script>

<template>
  <div v-if="location" class="flex items-center justify-between gap-4 text-sm min-w-0">
    <small class="text-muted-color">{{ $t('common.location') }}</small>
    <TraceLink
      v-if="location.type === 'warehouse'"
      type="warehouse"
      :id="location.id"
      :label="location.label"
      class="min-w-0"
    />
    <span v-else class="font-medium truncate" :title="location.label">
      {{ location.label }}
    </span>
  </div>
</template>
