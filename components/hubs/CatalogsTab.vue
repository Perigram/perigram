<template>
  <div class="flex flex-col gap-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-black">{{ $t('features.catalogs') }}</h2>
        <p class="text-sm">{{ $t('catalog.subtitle') }}</p>
      </div>
      <Button v-if="authStore.isManufacturer || authStore.isSuperAdmin" :label="$t('common.create')" icon="pi pi-plus" @click="openCreateDialog" />
    </div>

    <!-- Catalog Grid (New Pattern) -->
    <div v-if="!selectedCatalog" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <CatalogCard 
            v-for="catalog in catalogs" 
            :key="catalog._id" 
            :catalog="catalog" 
            variant="card"
            @click="viewCatalog(catalog)"
        />
        <div v-if="!loading && catalogs.length === 0" class="col-span-full p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 opacity-40">
            <i class="pi pi-book text-4xl"></i>
            <span class="font-bold">{{ $t('catalog.noCatalogsFound') }}</span>
            <Button v-if="authStore.isManufacturer" :label="$t('catalog.createFirstCatalog')" icon="pi pi-plus" size="small" text @click="openCreateDialog" />
        </div>
    </div>

    <!-- Catalog Detail View -->
    <div v-else class="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="mb-4">
            <Button :label="$t('catalog.backToLibrary')" icon="pi pi-arrow-left" text size="small" @click="selectedCatalog = null" />
        </div>
        <CatalogDetail 
            :catalog="selectedCatalog" 
            :colors="selectedCatalogColors"
            @edit="editCatalog"
            @add-sheet-type="openAddSheetType"
            @edit-sheet-type="openEditSheetType"
            @remove-sheet-type="removeSheetType"
        />
    </div>

    <!-- Create/Edit Catalog Dialog -->
    <Dialog v-model:visible="showCatalogDialog" :header="editingId ? $t('catalog.editCatalog') : $t('catalog.newCatalog')" :style="{ width: '500px' }" modal>
      <div class="flex flex-col gap-4 pt-4">
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('common.name') }} *</label>
          <InputText v-model="catalogForm.name" class="w-full" :placeholder="$t('project.name')" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm uppercase tracking-wider">{{ $t('catalog.materialType') }} *</label>
          <Select 
            v-model="catalogForm.material" 
            :options="materialPresets" 
            optionLabel="material" 
            optionValue="material" 
            editable 
            class="w-full" 
            :placeholder="$t('catalog.placeholders.material')"
            @change="onMaterialSelect" 
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
                <label class="font-bold text-sm uppercase tracking-wider">{{ $t('catalog.foilThicknessOptions') }} (mm)</label>
                <Chips v-model="catalogForm.foilThicknessOptions" :placeholder="$t('catalog.placeholders.commaSeparated')" />
            </div>
            <div class="flex flex-col gap-2">
                <label class="font-bold text-sm uppercase tracking-wider">{{ $t('catalog.sheetThicknessOptions') }} (mm)</label>
                <Chips v-model="catalogForm.sheetThicknessOptions" :placeholder="$t('catalog.placeholders.commaSeparated')" />
            </div>
        </div>
        <div class="flex flex-col gap-2">
            <label class="font-bold text-sm uppercase tracking-wider">{{ $t('catalog.widthOptions') }} (mm)</label>
            <Chips v-model="catalogForm.widthOptions" :placeholder="$t('catalog.placeholders.commaSeparated')" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm uppercase tracking-wider">{{ $t('common.description') }}</label>
          <Textarea v-model="catalogForm.description" class="w-full" rows="3" :placeholder="$t('catalog.placeholders.description')" />
        </div>
      </div>
      <template #footer>
          <Button :label="$t('common.cancel')" text severity="secondary" @click="showCatalogDialog = false" />
          <Button :label="$t('common.save')" @click="saveCatalog" :loading="submitting" />
      </template>
    </Dialog>

    <!-- Add/Edit Sheet Type Dialog (NOW JUST COLORS) -->
    <Dialog v-model:visible="showSheetTypeDialog" :header="editingSheetTypeId ? $t('catalog.editColor') : $t('catalog.addColor')" :style="{ width: '500px' }" modal>
        <div class="flex flex-col gap-6 pt-4">
            <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm uppercase tracking-wider">{{ $t('catalog.colorName') }} *</label>
                    <InputText v-model="sheetTypeForm.color" :placeholder="$t('catalog.placeholders.colorName')" />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm uppercase tracking-wider">{{ $t('catalog.colorCode') }}</label>
                    <InputText v-model="sheetTypeForm.colorCode" :placeholder="$t('catalog.placeholders.colorCode')" />
                </div>
                
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm uppercase tracking-wider">{{ $t('catalog.thumbnail') }}</label>
                    <div class="flex items-center gap-4">
                        <div class="w-16 h-16 rounded-lg border-2 overflow-hidden flex items-center justify-center" :style="{ backgroundColor: '#' + sheetTypeForm.colorFallback }">
                            <img v-if="sheetTypeForm.colorThumbnail" :src="sheetTypeForm.colorThumbnail" class="w-full h-full object-cover" />
                            <i v-else class="pi pi-image opacity-20 text-2xl"></i>
                        </div>
                        <FileUpload 
                            mode="basic" 
                            name="file" 
                            url="/api/files/upload?bucket=thumbnails" 
                            accept="image/*" 
                            :auto="true" 
                            @upload="onThumbnailUpload"
                            :chooseLabel="$t('catalog.uploadSwatch')"
                            class="p-button-sm"
                        />
                    </div>
                </div>

                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm uppercase tracking-wider">{{ $t('catalog.visualFallback') }}</label>
                    <div class="flex gap-2">
                        <ColorPicker v-model="sheetTypeForm.colorFallback" />
                        <InputText v-model="sheetTypeForm.colorFallback" class="flex-1 font-mono text-xs" />
                    </div>
                </div>
            </div>
        </div>
        <template #footer>
            <Button :label="$t('common.cancel')" text severity="secondary" @click="showSheetTypeDialog = false" />
            <Button :label="editingSheetTypeId ? $t('catalog.updateColor') : $t('catalog.addToPalette')" @click="saveSheetType" :loading="submitting" />
        </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';
import CatalogCard from '~/components/entities/Catalog/CatalogCard.vue';
import CatalogDetail from '~/components/entities/Catalog/CatalogDetail.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Dialog from 'primevue/dialog';
import ColorPicker from 'primevue/colorpicker';
import FileUpload from 'primevue/fileupload';
import Select from 'primevue/select';
import Chips from 'primevue/chips';

const toast = useToast();
const authStore = useAuthStore();

const catalogs = ref([]);
const materialPresets = ref([]);
const selectedCatalog = ref(null);
const loading = ref(false);
const submitting = ref(false);

const showCatalogDialog = ref(false);
const editingId = ref(null);
const catalogForm = ref({ 
    name: '', 
    description: '', 
    manufacturerId: '', 
    material: '', 
    foilThicknessOptions: [], 
    sheetThicknessOptions: [], 
    widthOptions: [] 
});

const showSheetTypeDialog = ref(false);
const editingSheetTypeId = ref(null);
const sheetTypeForm = ref({
    color: '',
    colorCode: '',
    colorFallback: 'cccccc',
    colorThumbnail: ''
});

async function load() {
  loading.value = true;
  try {
    const [catalogsData, presetsData] = await Promise.all([
        $fetch('/api/catalogs'),
        $fetch('/api/material-options')
    ]);
    catalogs.value = catalogsData;
    materialPresets.value = presetsData;
    
    if (selectedCatalog.value) {
        selectedCatalog.value = catalogs.value.find(c => c._id === selectedCatalog.value._id);
    }
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

function onMaterialSelect() {
    const materialValue = typeof catalogForm.value.material === 'object' 
        ? catalogForm.value.material?.material 
        : catalogForm.value.material;
        
    const preset = materialPresets.value.find(p => p.material === materialValue);
    if (preset) {
        catalogForm.value.foilThicknessOptions = [...preset.foilThicknessOptions].map(String);
        catalogForm.value.sheetThicknessOptions = [...preset.sheetThicknessOptions].map(String);
        catalogForm.value.widthOptions = [...preset.widthOptions].map(String);
    }
}

const selectedCatalogColors = ref([]);

function onThumbnailUpload(event) {
    const response = JSON.parse(event.xhr.response);
    sheetTypeForm.value.colorThumbnail = response.url;
    toast.add({ severity: 'success', summary: 'Success', detail: 'Thumbnail uploaded' });
}

async function viewCatalog(catalog) {
    selectedCatalog.value = catalog;
    try {
        const colorsData = await $fetch(`/api/colors?lineage.catalogId=${catalog._id}`);
        // Normalize colors for the detail view if needed, or handle in CatalogDetail
        selectedCatalogColors.value = colorsData;
    } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load colors' });
    }
}

function openCreateDialog() {
  catalogForm.value = { 
    name: '', 
    description: '', 
    manufacturerId: authStore.userData?.organizationId, 
    material: '', 
    foilThicknessOptions: [],
    sheetThicknessOptions: [],
    widthOptions: []
  };
  editingId.value = null;
  showCatalogDialog.value = true;
}

function editCatalog(catalog) {
  catalogForm.value = { 
    ...catalog,
    name: catalog.identity?.name || catalog.name,
    foilThicknessOptions: (catalog.options?.foilThicknesses || catalog.foilThicknessOptions || []).map(String),
    sheetThicknessOptions: (catalog.options?.sheetThicknesses || catalog.sheetThicknessOptions || []).map(String),
    widthOptions: (catalog.options?.widths || catalog.widthOptions || []).map(String)
  };
  editingId.value = catalog._id;
  showCatalogDialog.value = true;
}

async function saveCatalog() {
  submitting.value = true;
  try {
    const body = {
        name: catalogForm.value.name,
        description: catalogForm.value.description,
        material: catalogForm.value.material,
        options: {
            foilThicknesses: (catalogForm.value.foilThicknessOptions || [])
                .map(v => Number(String(v).replace(',', '.')))
                .filter(v => !isNaN(v)),
            sheetThicknesses: (catalogForm.value.sheetThicknessOptions || [])
                .map(v => Number(String(v).replace(',', '.')))
                .filter(v => !isNaN(v)),
            widths: (catalogForm.value.widthOptions || [])
                .map(v => Number(String(v).replace(',', '.')))
                .filter(v => !isNaN(v))
        }
    };

    if (editingId.value) {
      await $fetch(`/api/catalogs/${editingId.value}`, { method: 'PUT', body });
    } else {
      await $fetch('/api/catalogs', { method: 'POST', body });
    }
    showCatalogDialog.value = false;
    await load();
    toast.add({ severity: 'success', summary: 'Success', detail: 'Catalog saved' });
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message });
  } finally {
    submitting.value = false;
  }
}

function openAddSheetType() {
    sheetTypeForm.value = {
        color: '',
        colorCode: '',
        colorFallback: 'cccccc',
        colorThumbnail: '',
        pricePerSqm: 25
    };
    editingSheetTypeId.value = null;
    showSheetTypeDialog.value = true;
}

function openEditSheetType({ sheetType }) {
    // Map from new identity/visuals structure to form
    sheetTypeForm.value = {
        _id: sheetType._id,
        color: sheetType.identity?.name || sheetType.color,
        colorCode: sheetType.identity?.code || sheetType.colorCode,
        colorFallback: sheetType.visuals?.hexCode || sheetType.colorFallback || 'cccccc',
        colorThumbnail: sheetType.visuals?.textureUrl || sheetType.colorThumbnail || ''
    };
    
    if (sheetTypeForm.value.colorFallback?.startsWith('#')) {
        sheetTypeForm.value.colorFallback = sheetTypeForm.value.colorFallback.substring(1);
    }
    editingSheetTypeId.value = sheetType._id;
    showSheetTypeDialog.value = true;
}

async function saveSheetType() {
    submitting.value = true;
    try {
        const body = { 
            name: sheetTypeForm.value.color,
            code: sheetTypeForm.value.colorCode,
            hexCode: sheetTypeForm.value.colorFallback.startsWith('#') 
                ? sheetTypeForm.value.colorFallback 
                : '#' + sheetTypeForm.value.colorFallback,
            textureUrl: sheetTypeForm.value.colorThumbnail,
            catalogId: selectedCatalog.value._id
        };

        if (editingSheetTypeId.value) {
            await $fetch(`/api/colors/${editingSheetTypeId.value}`, {
                method: 'PUT',
                body
            });
        } else {
            await $fetch(`/api/colors`, {
                method: 'POST',
                body
            });
        }
        showSheetTypeDialog.value = false;
        await viewCatalog(selectedCatalog.value);
        toast.add({ severity: 'success', summary: 'Success', detail: 'Color specification saved' });
    } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.message });
    } finally {
        submitting.value = false;
    }
}
async function removeSheetType({ sheetTypeId }) {
    if (confirm('Remove this color?')) {
        try {
            await $fetch(`/api/colors/${sheetTypeId}`, { method: 'DELETE' });
            await viewCatalog(selectedCatalog.value);
            toast.add({ severity: 'success', summary: 'Success', detail: 'Removed' });
        } catch (e) {
            toast.add({ severity: 'error', summary: 'Error', detail: e.message });
        }
    }
}

onMounted(() => load());
</script>