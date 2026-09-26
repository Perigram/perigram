<template>
  <div class="h-full">
    <InstanceCard :instance="cassette" type-id="cassette" :variant="variant">
      <template #before-identity>
        <i class="pi pi-clone"></i>
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <CassetteThumbnail :cassette="cassette" />
        <DataBlock type-id="cassette" :entity="cassetteForDisplay" :fields="FIELDS" />
        <div v-if="geometryRevisionId" class="flex items-center justify-between gap-4">
          <small class="text-muted">{{ $t('revision.currentGeometry') }}</small>
          <InstanceInlineRef type="entityRevision" :id="geometryRevisionId" />
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
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

const { typeById } = useFileTypeView();
const FIELDS = computed(() => resolveInstanceDisplayFields({ typeId: 'cassette', surface: 'card', typeRecord: typeById('cassette') })
  .filter(field => field.display !== 'entityRef' && field.role !== 'previewSource'));

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
