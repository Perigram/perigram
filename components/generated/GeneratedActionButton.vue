<template>
  <Button
    v-if="action"
    :label="action.label || action.actionId"
    icon="pi pi-play"
    size="small"
    severity="secondary"
    outlined
    @click="$emit('execute', action)"
  />
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  actionId: { type: String, required: true }
});

defineEmits(['execute']);

const authStore = useAuthStore();
const action = computed(() => authStore.actionManifest.find(item => item.actionId === props.actionId));
</script>
