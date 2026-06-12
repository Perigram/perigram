<template>
  <div class="flex flex-col gap-6 py-4">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />

    <StateBlock
      v-else-if="!sheetDesigns.length"
      :message="$t('sheetDesign.noSheetDesigns')"
      :description="$t('sheetDesign.runNestingFirst')"
      icon="pi pi-map"
    />

    <ResponsiveGrid v-else>
      <SheetDesignCard
        v-for="design in sheetDesigns"
        :key="design._id"
        :design="design"
      />
    </ResponsiveGrid>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import SheetDesignCard from '~/components/entities/SheetDesign/SheetDesignCard.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useEntity } from '~/composables/useEntity';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const slug = route.params.slug;
const { entity: project, loading: projectLoading, fetch: loadProject } = useEntity('project', slug);
const { items, loading: sheetDesignsLoading, list } = useEntity('sheetDesign');
const loading = computed(() => projectLoading.value || sheetDesignsLoading.value);
const sheetDesigns = computed(() => [...items.value].sort((left, right) => (
  new Date(right.createdAt || right.origin?.timestamp || 0) -
  new Date(left.createdAt || left.origin?.timestamp || 0)
)));

const loadSheetDesigns = async () => {
  const loadedProject = project.value || await loadProject();
  await list({ projectId: loadedProject?._id });
};

onMounted(loadSheetDesigns);
</script>
