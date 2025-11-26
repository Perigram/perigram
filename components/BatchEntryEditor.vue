<template>
  <Dialog 
    v-model:visible="isOpen" 
    :header="$t('batch.editEntries')" 
    :modal="true"
    :style="{ width: '90vw', maxWidth: '1200px' }"
    @hide="$emit('close')"
  >
    <div class="batch-entry-editor">
      <div class="editor-header">
        <h3>{{ batch?.name }}</h3>
        <Button 
          :label="$t('batch.addEntry')" 
          icon="pi pi-plus" 
          @click="showAddEntryDialog = true"
        />
      </div>

      <DataTable 
        v-model:editingRows="editingRows"
        :value="entries" 
        editMode="row"
        dataKey="entryId"
        @row-edit-save="onRowEditSave"
        :paginator="true" 
        :rows="10"
        responsiveLayout="scroll"
      >
        <Column field="entryId" :header="$t('batch.entryId')" style="width: 10%">
          <template #editor="{ data }">
            <InputText v-model="data.entryId" />
          </template>
        </Column>
        
        <Column field="cassetteName" :header="$t('batch.cassette')" style="width: 20%">
          <template #body="slotProps">
            {{ getCassetteName(slotProps.data.cassetteTemplateId) }}
          </template>
          <template #editor="{ data }">
            <Dropdown 
              v-model="data.cassetteTemplateId" 
              :options="cassettes" 
              optionLabel="name" 
              optionValue="_id"
              :placeholder="$t('batch.selectCassette')"
            />
          </template>
        </Column>

        <Column field="quantity" :header="$t('batch.quantity')" style="width: 10%">
          <template #editor="{ data }">
            <InputNumber v-model="data.quantity" :min="1" />
          </template>
        </Column>

        <Column :header="$t('batch.dimensions')" style="width: 40%">
          <template #body="slotProps">
            <div class="dimensions-display">
              <Tag 
                v-for="(value, key) in slotProps.data.dimensions" 
                :key="key"
                :value="`${key}: ${value}`"
              />
            </div>
          </template>
          <template #editor="{ data }">
            <div class="dimensions-editor">
              <div v-for="(value, key) in data.dimensions" :key="key" class="dimension-input">
                <label>{{ key }}:</label>
                <InputNumber v-model="data.dimensions[key]" :minFractionDigits="2" />
              </div>
              <Button 
                icon="pi pi-plus" 
                size="small"
                @click="addDimension(data)"
              />
            </div>
          </template>
        </Column>

        <Column :rowEditor="true" style="width: 10%">
        </Column>

        <Column style="width: 10%">
          <template #body="slotProps">
            <Button 
              icon="pi pi-trash" 
              severity="danger" 
              size="small"
              @click="deleteEntry(slotProps.index)"
            />
          </template>
        </Column>
      </DataTable>

      <!-- Add Entry Dialog -->
      <Dialog 
        v-model:visible="showAddEntryDialog" 
        :header="$t('batch.addNewEntry')" 
        :modal="true"
        :style="{ width: '450px' }"
      >
        <div class="add-entry-form">
          <div class="field">
            <label for="newEntryId">{{ $t('batch.entryId') }}</label>
            <InputText id="newEntryId" v-model="newEntry.entryId" />
          </div>
          <div class="field">
            <label for="newCassette">{{ $t('batch.cassette') }}</label>
            <Dropdown 
              id="newCassette"
              v-model="newEntry.cassetteTemplateId" 
              :options="cassettes" 
              optionLabel="name" 
              optionValue="_id"
              :placeholder="$t('batch.selectCassette')"
            />
          </div>
          <div class="field">
            <label for="newQuantity">{{ $t('batch.quantity') }}</label>
            <InputNumber id="newQuantity" v-model="newEntry.quantity" :min="1" />
          </div>
        </div>
        <template #footer>
          <Button 
            :label="$t('common.cancel')" 
            severity="secondary" 
            @click="showAddEntryDialog = false"
          />
          <Button 
            :label="$t('common.add')" 
            @click="addEntry"
            :disabled="!isNewEntryValid"
          />
        </template>
      </Dialog>
    </div>

    <template #footer>
      <Button 
        :label="$t('common.cancel')" 
        severity="secondary" 
        @click="$emit('close')"
      />
      <Button 
        :label="$t('common.save')" 
        @click="save"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { cassettesStore } from '~/composables/cassettes';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Dropdown from 'primevue/dropdown';
import Tag from 'primevue/tag';

const props = defineProps({
  batch: {
    type: Object,
    required: true
  },
  modelValue: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'save', 'update:modelValue']);

const { t } = useI18n();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const entries = ref([]);
const editingRows = ref([]);
const showAddEntryDialog = ref(false);
const newEntry = ref({
  entryId: '',
  cassetteTemplateId: null,
  quantity: 1,
  dimensions: {}
});

const cassettes = computed(() => cassettesStore.getters.cassettes.value || []);

onMounted(async () => {
  // Load cassettes
  await cassettesStore.actions.fetchCassettes();
  
  // Load batch entries from table
  if (props.batch?.tableData) {
    entries.value = JSON.parse(JSON.stringify(props.batch.tableData));
  }
});

const getCassetteName = (cassetteId) => {
  const cassette = cassettes.value.find(c => c._id === cassetteId);
  return cassette?.name || t('batch.unknownCassette');
};

const isNewEntryValid = computed(() => {
  return newEntry.value.entryId && 
         newEntry.value.cassetteTemplateId && 
         newEntry.value.quantity > 0;
});

const addEntry = () => {
  entries.value.push({
    ...newEntry.value,
    dimensions: {}
  });
  showAddEntryDialog.value = false;
  newEntry.value = {
    entryId: '',
    cassetteTemplateId: null,
    quantity: 1,
    dimensions: {}
  };
};

const deleteEntry = (index) => {
  if (confirm(t('batch.confirmDeleteEntry'))) {
    entries.value.splice(index, 1);
  }
};

const onRowEditSave = (event) => {
  const { newData, index } = event;
  entries.value[index] = newData;
};

const addDimension = (entry) => {
  const key = prompt(t('batch.dimensionKey'));
  if (key && !entry.dimensions[key]) {
    entry.dimensions[key] = 0;
  }
};

const save = () => {
  emit('save', {
    ...props.batch,
    tableData: entries.value
  });
};
</script>

<style scoped lang="scss">
.batch-entry-editor {
  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h3 {
      margin: 0;
    }
  }

  .dimensions-display {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .dimensions-editor {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;

    .dimension-input {
      display: flex;
      align-items: center;
      gap: 4px;

      label {
        font-weight: 500;
        min-width: 30px;
      }
    }
  }
}

.add-entry-form {
  .field {
    margin-bottom: 20px;

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
    }
  }
}
</style>
