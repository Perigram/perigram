<template>
  <div class="flex flex-col gap-6">
    <!-- Warehouse Switcher/Selection -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--p-content-background)] p-4 rounded-2xl border border-[var(--p-content-border-color)] shadow-sm">
        <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-[var(--p-surface-100)] flex items-center justify-center text-primary border border-[var(--p-content-border-color)]">
                <i class="pi pi-building text-2xl"></i>
            </div>
            <div class="flex flex-col">
                <span class="text-[10px] font-black uppercase opacity-40">{{ $t('warehouse.activeWarehouse') }}</span>
                <Select 
                    v-model="selectedWarehouseId" 
                    :options="warehouses" 
                    option-label="name" 
                    option-value="_id" 
                    :placeholder="$t('warehouse.selectWarehouse')" 
                    class="w-64"
                    @change="onWarehouseChange"
                />
            </div>
        </div>
        <div class="flex gap-2">
            <Button v-if="authStore.can('warehouses', 'create')" :label="$t('warehouse.newWarehouse')" icon="pi pi-plus" size="small" @click="showDialog = true" />
            <Button v-if="selectedWarehouse" icon="pi pi-pencil" severity="secondary" text size="small" @click="edit(selectedWarehouse)" v-tooltip.top="$t('warehouse.editFacility')" />
        </div>
    </div>

    <!-- Active Warehouse View -->
    <div v-if="selectedWarehouse" class="animate-in fade-in duration-500">
        <WarehouseDetail 
            :warehouse="selectedWarehouse" 
            @edit="edit"
        />
    </div>

    <!-- Empty State -->
    <div v-else-if="!loading && warehouses.length === 0" class="p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 opacity-40">
        <i class="pi pi-building text-4xl"></i>
        <span class="font-bold">{{ $t('warehouse.noWarehouses') }}</span>
        <Button v-if="authStore.can('warehouses', 'create')" :label="$t('warehouse.createFirst')" icon="pi pi-plus" size="small" text @click="showDialog = true" />
    </div>

    <!-- Selection Prompt -->
    <div v-else-if="!loading && !selectedWarehouseId && warehouses.length > 0" class="p-12 border rounded-2xl flex flex-col items-center gap-4 bg-[var(--p-content-background)] opacity-60">
        <i class="pi pi-arrow-up text-2xl"></i>
        <span class="font-bold text-lg">{{ $t('warehouse.promptSelection') }}</span>
    </div>

    <!-- Edit Dialog -->
    <Dialog v-model:visible="showDialog" :header="editingId ? $t('warehouse.editWarehouse') : $t('warehouse.newWarehouse')" :style="{ width: '500px' }" modal>
      <div class="flex flex-col gap-4 pt-4">
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('common.name') }} *</label>
          <InputText v-model="form.name" class="w-full" placeholder="e.g., Main Production Stock" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('profile.address') }}</label>
          <Textarea v-model="form.address" class="w-full" rows="3" placeholder="Full location address..." />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('common.contact', 'Contact Person') }}</label>
          <InputText v-model="form.contactPerson" class="w-full" placeholder="Person responsible for this warehouse" />
        </div>
      </div>
      <template #footer>
          <Button :label="$t('common.cancel')" text severity="secondary" @click="showDialog = false" />
          <Button :label="$t('common.save')" @click="save" :loading="submitting" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';
import WarehouseDetail from '~/components/entities/Warehouse/WarehouseDetail.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';

const toast = useToast();
const authStore = useAuthStore();

const warehouses = ref([]);
const selectedWarehouseId = ref(null);
const loading = ref(false);
const submitting = ref(false);
const showDialog = ref(false);
const form = ref({ name: '', address: '', contactPerson: '', organizationId: authStore.userData?.organizationId });
const editingId = ref(null);

const selectedWarehouse = computed(() => {
    return warehouses.value.find(w => w._id === selectedWarehouseId.value);
});

async function load() {
  loading.value = true;
  try {
    warehouses.value = await $fetch('/api/warehouses');
    if (warehouses.value.length === 1 && !selectedWarehouseId.value) {
        selectedWarehouseId.value = warehouses.value[0]._id;
    }
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

function edit(warehouse) {
  form.value = { ...warehouse };
  editingId.value = warehouse._id;
  showDialog.value = true;
}

async function save() {
  submitting.value = true;
  try {
    let res;
    if (editingId.value) {
      res = await $fetch(`/api/warehouses/${editingId.value}`, { method: 'PUT', body: form.value });
    } else {
      res = await $fetch('/api/warehouses', { method: 'POST', body: form.value });
    }
    showDialog.value = false;
    form.value = { name: '', address: '', contactPerson: '', organizationId: authStore.userData?.organizationId };
    editingId.value = null;
    await load();
    if (!selectedWarehouseId.value && res?._id) {
        selectedWarehouseId.value = res._id;
    }
    toast.add({ severity: 'success', summary: 'Success', detail: 'Warehouse saved' });
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  } finally {
    submitting.value = false;
  }
}

onMounted(() => load());
</script>
