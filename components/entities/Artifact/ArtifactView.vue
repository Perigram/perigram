<script setup>
/**
 * Artifact View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  artifact: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['download', 'delete']);
const authStore = useAuthStore();
const { name } = useIdentity(props.artifact);
const icon = computed(() => {
    if (props.artifact.type === 'DXF') return 'pi-file-edit';
    if (props.artifact.type === 'SVG') return 'pi-image';
    return 'pi-file';
});
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i :class="['pi', icon]"></i>
        <span class="font-bold">{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <div @click="$emit('download', artifact)" class="flex items-center gap-3 p-2 border rounded-lg cursor-pointer">
        <div class="flex items-center gap-3">
            <i :class="['pi', icon]"></i>
            <span class="font-bold truncate">{{ name }}</span>
        </div>
      </div>
    </template>

    <template v-else-if="variant === 'card'">
      <Card @click="$emit('download', artifact)" class="cursor-pointer text-center">
        <template #content>
            <div class="flex flex-col items-center py-4 gap-4">
                <i :class="['pi', icon, 'text-3xl opacity-20']"></i>
                <div class="font-bold truncate max-w-full">{{ name }}</div>
                <small class="opacity-50 uppercase">{{ artifact.type }}</small>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-end" @click.stop>
                <Button v-if="authStore.can('artifacts', 'delete')" icon="pi pi-trash" text rounded severity="danger" @click="$emit('delete', artifact)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>