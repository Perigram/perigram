<template>
  <div class="flex flex-col gap-8">
    <ActionToolbar :title="$t('cassetteInstance.title')" :subtitle="$t('cassetteInstance.subtitle')" />

    <ResponsiveGrid v-if="instances.length">
      <CassetteInstanceCard
        v-for="instance in instances"
        :key="instance._id"
        :instance="instance"
        variant="card"
        @click="viewDetails(instance)"
      />
    </ResponsiveGrid>

    <StateBlock v-if="!loading && instances.length === 0" :message="$t('cassetteInstance.noInstances')" icon="pi pi-box" />
  </div>
</template>

<script setup>
import CassetteInstanceCard from '~/components/entities/CassetteInstance/CassetteInstanceCard.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

defineProps({
  instances: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view']);
const viewDetails = (instance) => emit('view', instance);
</script>
