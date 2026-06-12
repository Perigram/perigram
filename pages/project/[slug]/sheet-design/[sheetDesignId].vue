<template>
  <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
  <SheetDesignDetail v-else-if="design" :design="design" />
  <StateBlock v-else :message="$t('sheetDesign.notFound')" icon="pi pi-map" />
</template>

<script setup>
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import SheetDesignDetail from '~/components/entities/SheetDesign/SheetDesignDetail.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useEntity } from '~/composables/useEntity';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const { entity: design, loading, fetch } = useEntity('sheetDesign', route.params.sheetDesignId);

onMounted(() => fetch());
</script>
