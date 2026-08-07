<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2">
    <Textarea v-model="content" auto-resize class="min-h-80 w-full flex-1 font-mono text-sm" />
    <div class="flex justify-end">
      <Button :label="$t('common.save')" icon="pi pi-save" size="small" :loading="saving" @click="save" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';

const props = defineProps({ artifact: { type: Object, required: true } });
const emit = defineEmits(['saved']);
const content = ref('');
const saving = ref(false);

onMounted(async () => { content.value = await (await fetch(`/api/artifacts/${encodeURIComponent(props.artifact._id)}`)).text(); });

async function save() {
  saving.value = true;
  try {
    const mimeType = props.artifact.attachments?.primary?.metadata?.mimeType || 'text/plain';
    const extension = props.artifact.data?.type?.includes('CSV') ? '.csv' : '.txt';
    const form = new FormData();
    form.append('file', new File([content.value], `${props.artifact.identity?.name || 'artifact'}${extension}`, { type: mimeType }));
    emit('saved', await $fetch(`/api/artifacts/${encodeURIComponent(props.artifact._id)}/file`, { method: 'PUT', body: form }));
  } finally { saving.value = false; }
}
</script>
