<template>
  <div class="h-full">
    <EntityCard :entity="cassette" type-id="cassette" :variant="variant">
      <template #before-identity>
        <i class="pi pi-clone"></i>
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <CassetteThumbnail :cassette="cassette" />
        <DataBlock type-id="cassette" :entity="cassetteForDisplay" :fields="FIELDS" />
        <div v-if="geometryRevisionId" class="flex items-center justify-between gap-4">
          <small class="text-muted">{{ $t('revision.currentGeometry') }}</small>
          <EntityInlineRef type="entityRevision" :id="geometryRevisionId" />
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
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const FIELDS = resolveEntityDisplayFields({ typeId: 'cassette', surface: 'card' })
  .filter(field => field.display !== 'entityRef' && field.role !== 'previewSource');

const props = defineProps({
  cassette: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const definition = computed(() => props.cassette.data?.definition || {});
const parameterNames = computed(() => {
  const raw = props.cassette.data?.parameters || definition.value.parameters || [];
  return Array.isArray(raw) ? raw : Object.keys(raw);
});
const geometryRevisionId = computed(() => props.cassette.data?.revisions?.geometry?.currentId || null);
const cassetteForDisplay = computed(() => ({
  ...props.cassette,
  data: {
    ...(props.cassette.data || {}),
    parameters: parameterNames.value
  }
}));
</script>
