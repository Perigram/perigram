<template>
  <div>
    <EntityCard :entity="design" entity-type="cassette_design" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-cog"></i>
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <CassetteThumbnail :cassette="design" />
        <div v-if="template" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.cassetteTemplate') }}</small>
          <EntityInlineRef type="cassetteTemplate" :entity="template" />
        </div>
        <div v-if="revisionId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('revision.sourceRevision') }}</small>
          <EntityInlineRef type="entityRevision" :id="revisionId" />
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
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Cassette Design View Component - v24 Standardized
 * CassetteDesign has no status — uses EntityCard with status disabled.
 */
import { computed, ref, watch } from 'vue';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import EntityCard from '~/components/shared/EntityCard.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { useEntity } from '~/composables/useEntity';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const templateId = computed(() => props.design.lineage?.templateId || null);
const revisionId = computed(() => props.design.data?.derivedFrom?.revisionId || null);
const template = ref(null);
const templateEntity = useEntity('cassetteTemplate');

const downloadDxf = () => {
  if (!props.design?._id || !import.meta.client) return;
  window.location.href = `/api/cassette-designs/${encodeURIComponent(props.design._id)}/export`;
};

watch(templateId, async (id) => {
  template.value = null;
  const normalizedId = id?.toString?.() || id;
  if (!normalizedId) return;
  template.value = await templateEntity.fetch(normalizedId, { silent: true }).catch(() => null);
}, { immediate: true });
</script>
