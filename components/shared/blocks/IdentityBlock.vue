<script setup>
/**
 * IdentityBlock - v24 Standardized
 * Displays Name and ID/Slug/Serial
 */
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  entity: { type: Object, required: true },
  variant: { type: String, default: 'default' }, // default, compact, inline, header
  icon: { type: String, default: null }, // used in inline variant for Chip icon
  fields: { type: Array, default: () => [] } // optional extra fields: slug, serial, reference, uid
});

const { name, slug, serial, reference } = useIdentity(toRef(props, 'entity'));
const { t } = useI18n();
const uid = computed(() => props.entity?.identity?.uid || '');
const primary = computed(() => name.value || slug.value || uid.value || t('common.unnamed'));

const fieldValueMap = computed(() => ({
  uid: uid.value,
  slug: slug.value,
  serial: serial.value,
  reference: reference.value
}));

const identityMeta = computed(() => {
  if (!Array.isArray(props.fields) || props.fields.length === 0) return [];

  return props.fields
    .map((key) => ({ key, value: fieldValueMap.value[key] }))
    .filter((item) => item.value && item.value !== primary.value);
});

const identityMetaText = computed(() => identityMeta.value.map((item) => `${item.key}: ${item.value}`).join(' · '));
</script>

<template>
  <div v-if="props.entity" class="identity-block min-w-0">
    <!-- Header Variant (Main Page Titles) -->
    <div v-if="variant === 'header'" class="flex flex-col gap-1 min-w-0">
      <span class="truncate" :title="primary">{{ primary }}</span>
      <small v-if="identityMeta.length" class="truncate" :title="identityMetaText">{{ identityMetaText }}</small>
    </div>

    <!-- Compact Variant (Card rows, lists) -->
    <div v-else-if="variant === 'compact'" class="flex flex-col min-w-0">
      <span class="truncate" :title="primary">{{ primary }}</span>
      <small v-if="identityMeta.length" class="truncate" :title="identityMetaText">{{ identityMetaText }}</small>
    </div>

    <!-- Inline Variant — text-inline pill with optional icon -->
    <span
      v-else-if="variant === 'inline'"
      class="entity-inline-chip max-w-full"
      :title="identityMetaText || primary"
    >
      <i v-if="icon" :class="['entity-inline-chip-icon', icon]" aria-hidden="true"></i>
      <span class="entity-inline-chip-label">{{ primary }}</span>
    </span>

    <!-- Default (Card title area) -->
    <div v-else class="flex flex-col gap-0.5 min-w-0">
      <span class="truncate" :title="primary">{{ primary }}</span>
      <small v-if="identityMeta.length" class="truncate" :title="identityMetaText">{{ identityMetaText }}</small>
    </div>
  </div>
</template>
