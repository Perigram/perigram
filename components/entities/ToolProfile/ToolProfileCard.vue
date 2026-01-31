<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-wrench"></i>
        <span>{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card class="card-interactive">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-wrench"></i>
                    <span class="truncate">{{ name }}</span>
                </div>
                <Tag v-if="tool.diameter" :value="`D${tool.diameter}`" severity="secondary" />
            </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card class="card-interactive">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ name }}</span>
                <i class="pi pi-wrench"></i>
            </div>
        </template>
        <template #content>
            <Divider />
            <div class="flex flex-col gap-2">
                <div v-if="tool.diameter" class="flex justify-between items-center">
                    <small>Diameter</small>
                    <span>{{ tool.diameter }} mm</span>
                </div>
                <div v-if="tool.angle !== undefined" class="flex justify-between items-center">
                    <small>Angle</small>
                    <span>{{ tool.angle }}°</span>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * Tool Profile View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  tool: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name } = useIdentity(props.tool);
</script>