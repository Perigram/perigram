<template>
  <div class="h-full">
    <InstanceCard :instance="revision" type-id="entity_revision" :variant="variant" :show-status="false">
      <template #before-identity v-if="variant !== 'inline'">
        <i class="pi pi-history"></i>
      </template>
      <template #compact-content v-if="variant === 'compact'">
        <FactRows :rows="revisionRows" variant="compact" />
      </template>
      <template #default v-if="variant === 'card'">
        <Divider />
        <div class="grid grid-cols-1 gap-4">
          <FactRows :rows="revisionRows" />
          <div v-if="sourceType && sourceId" class="flex items-center justify-between gap-4">
            <small class="text-muted">{{ $t('revision.source') }}</small>
            <InstanceInlineRef :type="sourceType" :id="sourceId" />
          </div>
        </div>
      </template>
    </InstanceCard>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Divider from 'primevue/divider';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import FactRows from '~/components/shared/FactRows.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const ENTITY_TYPE_TO_UI_TYPE = {
  cassette: 'cassetteTemplate'
};

const props = defineProps({
  revision: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const sourceType = computed(() => ENTITY_TYPE_TO_UI_TYPE[props.revision.data?.typeId] || null);
const sourceId = computed(() => props.revision.data?.instanceId || null);

// The revision DTO's own facts (SPEC §24 stamp): scope, number, and the
// content hash's short form.
const revisionRows = computed(() => {
  const data = props.revision?.data || {};
  const hash = data.contentHash ? String(data.contentHash).replace(/^sha256:/, '').slice(0, 12) : '';
  return [
    data.scope ? { label: t('revision.scope'), display: String(data.scope), role: 'body' } : null,
    data.number != null ? { label: t('revision.number'), display: `v${data.number}`, role: 'technical' } : null,
    hash ? { label: t('revision.hash'), display: hash, role: 'technical' } : null
  ].filter(Boolean);
});
</script>
