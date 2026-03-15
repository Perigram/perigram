<script setup>
/**
 * IdentityBlock - v24 Standardized
 * Displays Name and ID/Slug/Serial
 */
import Chip from 'primevue/chip';
import { toRef } from 'vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  entity: { type: Object, required: true },
  variant: { type: String, default: 'default' }, // default, compact, inline, header
  icon: { type: String, default: null } // used in inline variant for Chip icon
});

const { name, slug, serial } = useIdentity(toRef(props, 'entity'));
</script>

<template>
  <div v-if="entity" class="identity-block">
    <!-- Header Variant (Main Page Titles) -->
    <div v-if="variant === 'header'" class="flex flex-col gap-1">
      <span class="text-2xl font-semibold">{{ name }}</span>
    </div>

    <!-- Compact Variant (Card rows, lists) -->
    <div v-else-if="variant === 'compact'" class="flex flex-col min-w-0">
      <span class="truncate" :title="name">{{ name }}</span>
    </div>

    <!-- Inline Variant — Chip pill with optional icon -->
    <Chip v-else-if="variant === 'inline'" :label="name" :icon="icon || undefined" :title="slug" />

    <!-- Default (Card title area) -->
    <div v-else class="flex flex-col gap-0.5">
      <span class="font-semibold">{{ name }}</span>
    </div>
  </div>
</template>
