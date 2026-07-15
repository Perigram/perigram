<script setup>
/**
 * Sheet Design View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import EntityCard from '~/components/shared/EntityCard.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import { cassetteDesignCountsForSheetDesign, cassettePlacementCountForSheetDesign } from '~/utils/sheetDesigns.js';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const route = useRoute();
const router = useRouter();
const projectSlug = computed(() => route.params.slug || null);
const canOpen = computed(() => Boolean(projectSlug.value && props.design._id));
const cassetteDesigns = computed(() => cassetteDesignCountsForSheetDesign(props.design));
const cassettePlacementCount = computed(() => cassettePlacementCountForSheetDesign(props.design));
const materialPool = computed(() => props.design.data?.materialPool || []);
const materialSourceCount = computed(() => materialPool.value.length);
const openDesign = () => {
  if (!canOpen.value) return;
  router.push(`/project/${projectSlug.value}/sheet-design/${props.design._id}`);
};
</script>

<template>
  <div>
    <EntityCard :entity="design" entity-type="sheet_design" :variant="variant" :show-status="false">
      <template #before-identity>
        <i class="pi pi-map"></i>
      </template>
      <template #compact-content>
        <SpecsBlock entity-type="sheetDesign" :entity="design" variant="compact" />
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <GeometryPreview :entity="design" />
        <div v-if="cassetteDesigns.length" class="flex items-center justify-between gap-2">
          <small>{{ $t('sheetDesign.cassetteDesigns') }}</small>
          <Tag :value="`${cassetteDesigns.length} / ${cassettePlacementCount}`" size="small" />
        </div>
        <div v-if="materialSourceCount" class="flex items-center justify-between gap-2">
          <small>{{ $t('sheetDesign.materialSources') }}</small>
          <Tag :value="materialSourceCount" severity="success" size="small" />
        </div>
        <SpecsBlock entity-type="sheetDesign" :entity="design" />
      </div>
      <template #footer>
        <div v-if="canOpen" class="flex justify-end" @click.stop>
          <Button :label="$t('common.open')" icon="pi pi-external-link" text size="small" @click="openDesign" />
        </div>
      </template>
    </EntityCard>
  </div>
</template>
