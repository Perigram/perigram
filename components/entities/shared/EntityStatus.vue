<script setup>
/**
 * Universal Status Component - v24 Standardized
 * Renders the status block for any entity in different variants
 */
const props = defineProps({
  entity: { type: Object, required: true },
  variant: { type: String, default: 'inline' } // inline, compact, card, full
});

const { state, timestamp, statusColor } = useStatus(props.entity);
</script>

<template>
  <div :class="[`status-container-${variant}`]">
    <!-- Inline Variant: Just a Tag -->
    <template v-if="variant === 'inline'">
      <Tag :value="state" :severity="statusColor" size="small" />
    </template>

    <!-- Compact Variant: Icon + Label -->
    <template v-else-if="variant === 'compact'">
      <div class="flex items-center gap-2">
        <i class="pi pi-circle-fill text-[8px]" :class="[`text-${statusColor}-500`]"></i>
        <span class="font-medium text-surface-700">{{ state }}</span>
      </div>
    </template>

    <!-- Card/Full Variant: Rich Info -->
    <template v-else>
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <Tag :value="state" :severity="statusColor" />
          <span v-if="timestamp" class="text-xs text-surface-500">
            {{ timestamp.toLocaleDateString() }}
          </span>
        </div>
        <div v-if="variant === 'full' && entity.status?.userId" class="text-xs text-surface-400 mt-1">
          Last acted by: {{ entity.status.userId }}
        </div>
      </div>
    </template>
  </div>
</template>
