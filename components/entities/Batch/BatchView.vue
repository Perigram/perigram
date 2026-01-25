<script setup>
/**
 * Batch View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';

const props = defineProps({
  batch: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const { name } = useIdentity(props.batch);

const handleCardClick = () => {
    emit('view', props.batch);
};
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i class="pi pi-truck"></i>
        <span class="font-bold">{{ name }}</span>
        <EntityStatus :entity="batch" variant="inline" />
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <i class="pi pi-truck"></i>
              <span class="font-bold">{{ name }}</span>
            </div>
            <EntityStatus :entity="batch" variant="inline" />
          </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #title>
          <div class="flex justify-between items-start gap-4">
            <div class="flex items-center gap-2">
                <i class="pi pi-truck"></i>
                <span class="font-bold">{{ name }}</span>
            </div>
            <EntityStatus :entity="batch" variant="full" />
          </div>
        </template>
        <template #content>
            <div class="flex flex-col gap-2">
                <div class="flex justify-between">
                    <span>Receipt ID</span>
                    <span class="font-mono">{{ batch.identity?.reference }}</span>
                </div>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-end gap-2" @click.stop>
                <Button icon="pi pi-pencil" text rounded @click="$emit('edit', batch)" />
                <Button label="View Details" icon="pi pi-search" @click="$emit('view', batch)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>