<script setup>
/**
 * Requisition View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';

const props = defineProps({
  requisition: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const { name } = useIdentity(props.requisition);

const handleCardClick = () => {
    emit('view', props.requisition);
};
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i class="pi pi-shopping-cart"></i>
        <span class="font-bold">{{ name }}</span>
        <EntityStatus :entity="requisition" variant="inline" />
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <i class="pi pi-shopping-cart"></i>
              <span class="font-bold">{{ name }}</span>
            </div>
            <EntityStatus :entity="requisition" variant="inline" />
          </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #title>
          <div class="flex justify-between items-start gap-4">
            <div class="flex items-center gap-2">
                <i class="pi pi-shopping-cart"></i>
                <span class="font-bold">{{ name }}</span>
            </div>
            <EntityStatus :entity="requisition" variant="full" />
          </div>
        </template>
        <template #content>
            <div class="flex flex-col gap-2">
                <div class="flex justify-between">
                    <span>Items</span>
                    <span class="font-bold">{{ requisition.items?.length || 0 }}</span>
                </div>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-end gap-2" @click.stop>
                <Button icon="pi pi-pencil" text rounded @click="$emit('edit', requisition)" />
                <Button icon="pi pi-trash" text rounded severity="danger" @click="$emit('delete', requisition)" />
                <Button label="Manage" icon="pi pi-cog" @click="$emit('view', requisition)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>