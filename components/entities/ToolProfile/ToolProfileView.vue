<script setup>
/**
 * Tool Profile View Component - v24 Standardized
 */
import Card from 'primevue/card';

const props = defineProps({
  tool: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name } = useIdentity(props.tool);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i class="pi pi-wrench"></i>
        <span class="font-bold">{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card>
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <i class="pi pi-wrench"></i>
              <span class="font-bold">{{ name }}</span>
            </div>
            <small v-if="tool.diameter">D{{ tool.diameter }}</small>
          </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card>
        <template #title>
          <div class="flex justify-between items-center">
            <span class="font-bold">{{ name }}</span>
            <i class="pi pi-wrench"></i>
          </div>
        </template>
        <template #content>
            <div class="flex flex-col gap-2">
                <div v-if="tool.diameter" class="flex justify-between">
                    <span>Diameter</span>
                    <span class="font-bold">{{ tool.diameter }} mm</span>
                </div>
                <div v-if="tool.angle !== undefined" class="flex justify-between">
                    <span>Angle</span>
                    <span class="font-bold">{{ tool.angle }}°</span>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>
