<script setup>
/**
 * IdentityBlock - v24 Standardized
 * Displays Name and ID/Slug/Serial
 */
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  entity: { type: Object, required: true },
  variant: { type: String, default: 'default' } // default, compact, header
});

const { name, slug, serial } = useIdentity(props.entity);
</script>

<template>
  <div v-if="entity" class="identity-block">
    <!-- Header Variant (Main Page Titles) -->
    <div v-if="variant === 'header'" class="flex flex-col gap-1">
      <h1>{{ name }}</h1>
      <div class="flex items-center gap-2">
        <code>{{ slug }}</code>
        <small v-if="serial">| {{ serial }}</small>
      </div>
    </div>

    <!-- Compact Variant (Lists, Cards) -->
    <div v-else-if="variant === 'compact'" class="flex flex-col min-w-0">
      <span class="truncate" :title="name">{{ name }}</span>
      <small class="truncate">{{ slug }}</small>
    </div>

    <!-- Default -->
    <div v-else class="flex flex-col gap-1">
      <div class="font-bold">{{ name }}</div>
      <div class="text-xs opacity-60 font-mono">{{ slug }}</div>
    </div>
  </div>
</template>