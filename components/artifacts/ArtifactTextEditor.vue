<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2">
    <DataTable v-if="isCsv" :value="rows" edit-mode="cell" scrollable scroll-height="flex" size="small" class="min-h-80 flex-1">
      <Column v-for="column in columns" :key="column" :field="column" :header="column">
        <template #editor="{ data, field }"><InputText v-model="data[field]" size="small" /></template>
      </Column>
    </DataTable>
    <Textarea v-else v-model="content" auto-resize class="min-h-80 w-full flex-1 font-serif text-sm" />
    <div class="flex justify-end">
      <Button :label="$t('common.save')" icon="pi pi-save" size="small" :loading="saving" @click="save" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import * as XLSX from 'xlsx';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';

const props = defineProps({ artifact: { type: Object, required: true } });
const emit = defineEmits(['saved']);
const content = ref('');
const columns = ref([]);
const rows = ref([]);
const saving = ref(false);
const isCsv = computed(() => props.artifact.data?.type?.includes('CSV'));

onMounted(async () => {
  content.value = await (await fetch(`/api/artifacts/${encodeURIComponent(props.artifact._id)}`)).text();
  if (!isCsv.value) return;
  const sheet = XLSX.read(content.value, { type: 'string' }).Sheets.Sheet1;
  const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  columns.value = (values.shift() || []).map((value, index) => String(value || `${index + 1}`));
  rows.value = values.map(row => Object.fromEntries(columns.value.map((column, index) => [column, row[index] ?? ''])));
});

async function save() {
  saving.value = true;
  try {
    const mimeType = props.artifact.attachments?.primary?.metadata?.mimeType || 'text/plain';
    const extension = props.artifact.data?.type?.includes('CSV') ? '.csv' : '.txt';
    const form = new FormData();
    const nextContent = isCsv.value
      ? XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows.value, { header: columns.value }))
      : content.value;
    form.append('file', new File([nextContent], `${props.artifact.identity?.name || 'artifact'}${extension}`, { type: mimeType }));
    emit('saved', await $fetch(`/api/artifacts/${encodeURIComponent(props.artifact._id)}/file`, { method: 'PUT', body: form }));
  } finally { saving.value = false; }
}
</script>
