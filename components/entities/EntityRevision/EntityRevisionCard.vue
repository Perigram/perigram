<template>
  <div class="h-full">
    <InstanceCard :entity="revision" type-id="entity_revision" :variant="variant" :show-status="false">
      <template #before-identity>
        <i class="pi pi-history"></i>
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <DataBlock type-id="entityRevision" :entity="revisionForDisplay" :fields="FIELDS" />
        <div v-if="sourceType && sourceId" class="flex items-center justify-between gap-4">
          <small class="text-muted">{{ $t('revision.source') }}</small>
          <InstanceInlineRef :type="sourceType" :id="sourceId" />
        </div>
      </div>
    </InstanceCard>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Divider from 'primevue/divider';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';

const FIELDS = resolveInstanceDisplayFields({ typeId: 'entityRevision', surface: 'card' })
  .filter(field => field.display !== 'entityRef');

const ENTITY_TYPE_TO_UI_TYPE = {
  cassette: 'cassetteTemplate'
};

const props = defineProps({
  revision: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const sourceType = computed(() => ENTITY_TYPE_TO_UI_TYPE[props.revision.data?.typeId] || null);
const sourceId = computed(() => props.revision.data?.instanceId || null);
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
