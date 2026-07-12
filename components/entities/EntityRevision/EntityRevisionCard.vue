<template>
  <div class="h-full">
    <EntityCard :entity="revision" entity-type="entity_revision" :variant="variant" :show-status="false">
      <template #before-identity>
        <i class="pi pi-history"></i>
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <DataBlock entity-type="entityRevision" :entity="revisionForDisplay" :fields="FIELDS" />
        <div v-if="sourceType && sourceId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('revision.source') }}</small>
          <EntityInlineRef :type="sourceType" :id="sourceId" />
        </div>
      </div>
    </EntityCard>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const FIELDS = resolveEntityDisplayFields({ entityType: 'entityRevision', surface: 'card' })
  .filter(field => field.display !== 'entityRef');

const ENTITY_TYPE_TO_UI_TYPE = {
  cassette: 'cassetteTemplate'
};

const props = defineProps({
  revision: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const sourceType = computed(() => ENTITY_TYPE_TO_UI_TYPE[props.revision.data?.entityType] || null);
const sourceId = computed(() => props.revision.data?.entityId || null);
const revisionForDisplay = computed(() => ({
  ...props.revision,
  data: {
    ...(props.revision.data || {}),
    shortHash: props.revision.data?.contentHash
      ? props.revision.data.contentHash.replace(/^sha256:/, '').slice(0, 12)
      : ''
  }
}));
</script>
