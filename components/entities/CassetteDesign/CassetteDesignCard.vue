<template>
  <div>
    <InstanceCard :entity="design" type-id="cassette_design" :variant="variant" :show-status="false">
      <template #before-identity>
        <InstanceInlineRef
          v-if="templateId"
          type="cassetteTemplate"
          :id="templateId"
          :interactive="false"
        />
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <CassetteThumbnail :cassette="design" prefer-geometry />
        <div v-if="revisionId" class="flex items-center justify-between gap-4">
          <small class="text-muted">{{ $t('revision.sourceRevision') }}</small>
          <InstanceInlineRef type="entityRevision" :id="revisionId" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end">
          <Button
            icon="pi pi-download"
            text
            size="small"
            :aria-label="$t('cassetteDesign.downloadDxf')"
            @click="downloadDxf"
          />
        </div>
      </template>
    </InstanceCard>
  </div>
</template>

<script setup>
/**
 * Cassette Design View Component - v24 Standardized
 * CassetteDesign has no status — uses InstanceCard with status disabled.
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const revisionId = computed(() => props.design.provenance?.derivedFrom?.source?.revisionId || null);
const templateId = computed(() => {
  const source = props.design.provenance?.derivedFrom?.source;
  return source?.type === 'cassette' ? source.id : null;
});

const downloadDxf = () => {
  if (!props.design?._id || !import.meta.client) return;
  window.location.href = `/api/cassette-designs/${encodeURIComponent(props.design._id)}/export`;
};

</script>
