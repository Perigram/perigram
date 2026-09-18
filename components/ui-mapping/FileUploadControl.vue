<template>
  <FileUpload
    mode="basic"
    :choose-label="chooseLabel"
    :accept="accept"
    :max-file-size="payload?.maxSize"
    auto
    custom-upload
    class="w-full"
  />
</template>

<script setup>
import { computed } from 'vue';
import FileUpload from 'primevue/fileupload';

const props = defineProps({ payload: { type: Object, default: null } });

const accept = computed(() => (props.payload?.accept || props.payload?.mime || []).join(','));
const chooseLabel = computed(() => (props.payload?.accept || props.payload?.mime || []).join(' / ') || 'Upload');
</script>
