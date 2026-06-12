<template>
  <div class="flex flex-col gap-4">
    <ActionToolbar :title="selectedWarehouseLabel || $t('warehouse.title')" :subtitle="$t('warehouse.subtitle')">
      <template #actions>
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="selectedWarehouse && authStore.can('warehouses', 'edit')"
            icon="pi pi-pencil"
            :label="$t('warehouse.editFacility')"
            severity="secondary"
            outlined
            size="small"
            @click="openWarehouseDialog(selectedWarehouse)"
          />
          <Button
            v-if="selectedWarehouse && authStore.can('warehouses', 'delete')"
            icon="pi pi-trash"
            :label="$t('common.delete')"
            severity="danger"
            outlined
            size="small"
            @click="confirmDeleteWarehouse"
          />
          <Button
            v-if="authStore.can('warehouses', 'create')"
            icon="pi pi-plus"
            :label="$t('warehouse.newWarehouse')"
            size="small"
            @click="openWarehouseDialog()"
          />
        </div>
      </template>
    </ActionToolbar>

    <div v-if="warehouses.length" class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(16rem,22rem)_1fr] lg:items-end">
      <div class="flex flex-col gap-2">
        <label>{{ $t('warehouse.activeWarehouse') }}</label>
        <Select
          v-model="selectedWarehouseId"
          :options="warehouseOptions"
          option-label="name"
          option-value="id"
          class="w-full"
        />
      </div>
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <Tag v-if="selectedWarehouse?.data?.type" :value="selectedWarehouse.data.type" severity="secondary" size="small" />
        <Tag
          :value="`${warehouseStats.totalBatches} ${$t('warehouse.storedBatches')}`"
          severity="secondary"
          size="small"
        />
        <Tag
          :value="`${warehouseStats.totalSheets} ${$t('warehouse.availableSheets')}`"
          severity="info"
          size="small"
        />
        <Tag
          :value="`${warehouseStats.totalRemnants} ${$t('warehouse.remnants')}`"
          severity="secondary"
          size="small"
        />
        <Tag
          :value="`${warehouseStats.totalCassetteInstances} ${$t('warehouse.cassetteInstances')}`"
          severity="secondary"
          size="small"
        />
        <small v-if="selectedWarehouse?.data?.address" class="min-w-0 truncate text-muted-color">
          <i class="pi pi-map-marker"></i>
          {{ selectedWarehouse.data.address }}
        </small>
      </div>
    </div>

    <StateBlock
      v-if="!loading && !warehouses.length"
      :message="$t('warehouse.noWarehouses')"
      icon="pi pi-building"
    >
      <template #actions>
        <Button
          v-if="authStore.can('warehouses', 'create')"
          :label="$t('warehouse.createFirst')"
          icon="pi pi-plus"
          @click="openWarehouseDialog()"
        />
      </template>
    </StateBlock>

    <div v-if="selectedWarehouse" class="flex flex-col gap-4">
      <Tabs value="0">
        <TabList>
          <Tab value="0">{{ $t('piles.title') }}</Tab>
          <Tab value="1">{{ $t('sheets.title') }}</Tab>
          <Tab value="2">{{ $t('remnants.title') }}</Tab>
          <Tab value="3">{{ $t('cassetteInstance.title') }}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="0">
            <PilesTab
              :piles="inventory.piles"
              :loading="loading"
              @create="openPileDialog()"
              @edit="openPileDialog"
              @delete="confirmDeletePile"
            />
          </TabPanel>
          <TabPanel value="1">
            <SheetsTab :sheets="inventory.sheets" :loading="loading" />
          </TabPanel>
          <TabPanel value="2">
            <RemnantsTab :remnants="inventory.remnants" :loading="loading" />
          </TabPanel>
          <TabPanel value="3">
            <CassetteInstancesTab :instances="inventory.instances" :loading="loading" />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>

    <StandardDialog
      v-model:visible="warehouseDialogVisible"
      :header="warehouseForm._id ? $t('warehouse.editWarehouse') : $t('warehouse.newWarehouse')"
      size="lg"
    >
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
        <div class="flex flex-col gap-2">
          <label>{{ $t('common.name') }}</label>
          <InputText v-model="warehouseForm.name" :placeholder="$t('warehouse.placeholders.name')" />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('warehouse.type') }}</label>
          <InputText v-model="warehouseForm.type" />
        </div>
        <div class="flex flex-col gap-2 md:col-span-2">
          <label>{{ $t('warehouse.address') }}</label>
          <InputText v-model="warehouseForm.address" :placeholder="$t('warehouse.placeholders.address')" />
        </div>
        <div class="flex flex-col gap-2 md:col-span-2">
          <label>{{ $t('warehouse.contactPerson') }}</label>
          <InputText v-model="warehouseForm.contactPerson" :placeholder="$t('warehouse.placeholders.contact')" />
        </div>
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="warehouseDialogVisible = false" />
        <Button :label="$t('common.save')" :loading="saving" :disabled="!warehouseForm.name" @click="saveWarehouse" />
      </template>
    </StandardDialog>

    <StandardDialog
      v-model:visible="pileDialogVisible"
      :header="pileForm._id ? $t('warehouse.editStock') : $t('warehouse.addStock')"
      size="lg"
    >
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
        <div class="flex flex-col gap-2">
          <label>{{ $t('entities.catalog') }}</label>
          <Select
            v-model="pileForm.catalogId"
            :options="catalogOptions"
            option-label="name"
            option-value="id"
            class="w-full"
            @change="loadColorsForCatalog"
          />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('entities.color') }}</label>
          <Select
            v-model="pileForm.colorId"
            :options="colorOptions"
            option-label="name"
            option-value="id"
            class="w-full"
            :disabled="!pileForm.catalogId"
          />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('warehouse.materialName') }}</label>
          <InputText v-model="pileForm.materialName" :placeholder="$t('warehouse.placeholders.material')" />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('warehouse.colorName') }}</label>
          <InputText v-model="pileForm.colorName" :placeholder="$t('warehouse.placeholders.color')" />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('piles.receiptId') }}</label>
          <InputText v-model="pileForm.serial" />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('common.quantity') }}</label>
          <InputNumber v-model="pileForm.quantity" :min="0" show-buttons fluid />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('nesting.width') }}</label>
          <InputNumber v-model="pileForm.width" :min="1" suffix=" mm" fluid />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('nesting.length') }}</label>
          <InputNumber v-model="pileForm.length" :min="1" suffix=" mm" fluid />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('warehouse.sheetThickness') }}</label>
          <InputNumber v-model="pileForm.sheetThickness" :min="0" suffix=" mm" fluid />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('warehouse.foilThickness') }}</label>
          <InputNumber v-model="pileForm.foilThickness" :min="0" suffix=" mm" fluid />
        </div>
      </div>
      <Message v-if="!catalogOptions.length" severity="info">
        {{ $t('warehouse.catalogFallback') }}
      </Message>
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="pileDialogVisible = false" />
        <Button :label="$t('common.save')" :loading="saving" :disabled="!canSavePile" @click="savePile" />
      </template>
    </StandardDialog>
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import ConfirmDialog from 'primevue/confirmdialog';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import PilesTab from './PilesTab.vue';
import SheetsTab from './SheetsTab.vue';
import RemnantsTab from './RemnantsTab.vue';
import CassetteInstancesTab from './CassetteInstancesTab.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useEntity } from '~/composables/useEntity';
import { entitySelectLabel, entitySelectValue, namedSelectOptions } from '~/utils/selectOptions';

const authStore = useAuthStore();
const toast = useToast();
const confirm = useConfirm();
const { t } = useI18n();
const warehouseEntity = useEntity('warehouse');
const pileEntity = useEntity('pile');
const sheetEntity = useEntity('sheet');
const remnantEntity = useEntity('remnant');
const cassetteInstanceEntity = useEntity('cassetteInstance');
const catalogEntity = useEntity('catalog');
const colorEntity = useEntity('color');

const warehouses = ref([]);
const catalogs = ref([]);
const colors = ref([]);
const selectedWarehouseId = ref(null);
const inventory = ref({ piles: [], sheets: [], remnants: [], instances: [] });
const loading = ref(false);
const saving = ref(false);
const warehouseDialogVisible = ref(false);
const pileDialogVisible = ref(false);

const warehouseForm = ref({ _id: null, name: '', type: 'Standard', address: '', contactPerson: '' });
const pileForm = ref({
  _id: null,
  catalogId: null,
  colorId: null,
  materialName: '',
  colorName: '',
  serial: '',
  quantity: 1,
  used: 0,
  width: 3000,
  length: 1500,
  sheetThickness: 4,
  foilThickness: 0
});

const activeOrganizationId = computed(() => (
  authStore.organizationData?._id ||
  authStore.userData?.organizationId ||
  authStore.userOrganizations?.[0]?._id ||
  null
));

const warehouseOptions = computed(() => warehouses.value.map(warehouse => ({
  ...warehouse,
  id: entitySelectValue(warehouse),
  name: entitySelectLabel(warehouse, 'Warehouse')
})));
const catalogOptions = computed(() => namedSelectOptions(catalogs.value, 'Catalog'));
const colorOptions = computed(() => namedSelectOptions(colors.value, 'Color'));
const selectedWarehouse = computed(() => warehouses.value.find(w => entitySelectValue(w) === selectedWarehouseId.value));
const selectedWarehouseLabel = computed(() => selectedWarehouse.value ? entitySelectLabel(selectedWarehouse.value, 'Warehouse') : '');
const selectedCatalog = computed(() => catalogs.value.find(catalog => entitySelectValue(catalog) === pileForm.value.catalogId));
const selectedColor = computed(() => colors.value.find(color => entitySelectValue(color) === pileForm.value.colorId));

const warehouseStats = computed(() => {
  const pileSheets = inventory.value.piles.reduce((sum, pile) => {
    const stock = pile.data?.stock || {};
    return sum + Math.max((stock.total || 0) - (stock.used || 0), 0);
  }, 0);
  return {
    totalBatches: inventory.value.piles.length,
    totalSheets: pileSheets + inventory.value.sheets.length,
    totalRemnants: inventory.value.remnants.length,
    totalCassetteInstances: inventory.value.instances.length
  };
});

const canSavePile = computed(() => (
  selectedWarehouseId.value &&
  (pileForm.value.catalogId || pileForm.value.materialName.trim()) &&
  (pileForm.value.colorId || pileForm.value.colorName.trim()) &&
  pileForm.value.quantity >= 0 &&
  pileForm.value.width > 0 &&
  pileForm.value.length > 0
));

const loadWarehouses = async () => {
  loading.value = true;
  try {
    warehouses.value = await warehouseEntity.list();
    if (warehouses.value.length > 0 && !selectedWarehouseId.value) {
      selectedWarehouseId.value = entitySelectValue(warehouses.value[0]);
    }
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const loadCatalogs = async () => {
  try {
    catalogs.value = await catalogEntity.list();
  } catch (error) {
    console.error(error);
    catalogs.value = [];
  }
};

const loadColorsForCatalog = async () => {
  pileForm.value.colorId = null;
  colors.value = [];
  if (!pileForm.value.catalogId) return;
  try {
    colors.value = await colorEntity.list({ catalogId: pileForm.value.catalogId });
  } catch (error) {
    console.error(error);
  }
};

const loadInventory = async (warehouseId) => {
  if (!warehouseId) return;
  loading.value = true;
  try {
    const [piles, sheets, remnants, instances] = await Promise.all([
      pileEntity.list({ 'lineage.warehouseId': warehouseId }),
      sheetEntity.list({ 'lineage.warehouseId': warehouseId }),
      remnantEntity.list({ 'lineage.warehouseId': warehouseId }),
      cassetteInstanceEntity.list({ 'lineage.warehouseId': warehouseId })
    ]);
    inventory.value = {
      piles,
      sheets: sheets.filter(sheet => sheet.data?.source !== 'QUEUE_CUT'),
      remnants,
      instances
    };
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const openWarehouseDialog = (warehouse = null) => {
  warehouseForm.value = {
    _id: warehouse?._id || null,
    name: warehouse?.identity?.name || '',
    type: warehouse?.data?.type || 'Standard',
    address: warehouse?.data?.address || '',
    contactPerson: warehouse?.data?.contactPerson || ''
  };
  warehouseDialogVisible.value = true;
};

const saveWarehouse = async () => {
  if (!warehouseForm.value.name) return;
  saving.value = true;
  try {
    const payload = {
      name: warehouseForm.value.name,
      type: warehouseForm.value.type,
      address: warehouseForm.value.address,
      contactPerson: warehouseForm.value.contactPerson
    };
    const saved = warehouseForm.value._id
      ? await warehouseEntity.update({ name: payload.name, data: payload }, warehouseForm.value._id)
      : await warehouseEntity.create({ ...payload, organizationId: activeOrganizationId.value });
    await loadWarehouses();
    selectedWarehouseId.value = entitySelectValue(saved);
    warehouseDialogVisible.value = false;
    toast.add({ severity: 'success', summary: t('warehouse.messages.saved'), life: 2000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 });
  } finally {
    saving.value = false;
  }
};

const openPileDialog = async (pile = null) => {
  const specs = pile?.specs || pile?.data?.specs || {};
  const stock = pile?.data?.stock || {};
  pileForm.value = {
    _id: pile?._id || null,
    catalogId: pile?.lineage?.catalogId?.toString?.() || pile?.lineage?.catalogId || null,
    colorId: pile?.lineage?.colorId?.toString?.() || pile?.lineage?.colorId || null,
    materialName: pile?.data?.material || '',
    colorName: pile?.data?.color || '',
    serial: pile?.identity?.serial || pile?.data?.serial || '',
    quantity: stock.total ?? 1,
    used: stock.used ?? 0,
    width: specs.width || 3000,
    length: specs.length || 1500,
    sheetThickness: specs.sheetThickness || specs.thickness || 4,
    foilThickness: specs.foilThickness || 0
  };
  if (pileForm.value.catalogId) {
    await loadColorsForCatalog();
    pileForm.value.colorId = pile?.lineage?.colorId?.toString?.() || pile?.lineage?.colorId || null;
  }
  pileDialogVisible.value = true;
};

const pileSpecs = () => ({
  width: pileForm.value.width,
  length: pileForm.value.length,
  sheetThickness: pileForm.value.sheetThickness,
  foilThickness: pileForm.value.foilThickness
});

const ensurePileCatalogAndColor = async () => {
  let catalogId = pileForm.value.catalogId;
  let colorId = pileForm.value.colorId;
  let catalog = selectedCatalog.value || null;
  let color = selectedColor.value || null;

  if (!catalogId) {
    catalog = await catalogEntity.create({
      source: 'WAREHOUSE_STOCK',
      name: pileForm.value.materialName.trim(),
      material: pileForm.value.materialName.trim(),
      options: {
        sheetThicknesses: [pileForm.value.sheetThickness].filter(value => value > 0),
        foilThicknesses: [pileForm.value.foilThickness].filter(value => value > 0),
        widths: [pileForm.value.width].filter(value => value > 0),
        lengths: [pileForm.value.length].filter(value => value > 0)
      }
    });
    catalogId = entitySelectValue(catalog);
    catalogs.value.push(catalog);
    pileForm.value.catalogId = catalogId;
  }

  if (!colorId) {
    color = await colorEntity.create({
      source: 'WAREHOUSE_STOCK',
      catalogId,
      name: pileForm.value.colorName.trim(),
      code: pileForm.value.colorName.trim()
    });
    colorId = entitySelectValue(color);
    colors.value.push(color);
    pileForm.value.colorId = colorId;
  }

  return { catalog, color, catalogId, colorId };
};

const savePile = async () => {
  if (!canSavePile.value) return;
  saving.value = true;
  try {
    const refs = await ensurePileCatalogAndColor();
    const catalogName = refs.catalog?.identity?.name || refs.catalog?.data?.material || pileForm.value.materialName || '';
    const colorName = refs.color?.identity?.name || refs.color?.data?.code || pileForm.value.colorName || '';
    const payload = {
      warehouseId: selectedWarehouseId.value,
      catalogId: refs.catalogId,
      colorId: refs.colorId,
      serial: pileForm.value.serial,
      quantity: pileForm.value.quantity,
      stock: { total: pileForm.value.quantity, used: pileForm.value.used || 0 },
      specs: pileSpecs(),
      material: selectedCatalog.value?.data?.material || catalogName,
      color: colorName,
      catalogName,
      colorName
    };

    if (pileForm.value._id) {
      await pileEntity.update({
        name: [payload.material, payload.color, payload.serial].filter(Boolean).join(' / '),
        serial: payload.serial,
        specs: payload.specs,
        stock: payload.stock,
        material: payload.material,
        color: payload.color
      }, pileForm.value._id);
    } else {
      await pileEntity.create(payload);
    }

    await loadInventory(selectedWarehouseId.value);
    pileDialogVisible.value = false;
    toast.add({ severity: 'success', summary: t('warehouse.messages.stockSaved'), life: 2000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 });
  } finally {
    saving.value = false;
  }
};

const confirmDeletePile = (pile) => {
  confirm.require({
    message: t('warehouse.confirmDeleteStock'),
    header: t('common.confirmation'),
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      try {
        await pileEntity.remove(pile._id);
        await loadInventory(selectedWarehouseId.value);
        toast.add({ severity: 'success', summary: t('warehouse.messages.stockDeleted'), life: 2000 });
      } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 });
      }
    }
  });
};

const confirmDeleteWarehouse = () => {
  if (!selectedWarehouse.value) return;
  confirm.require({
    message: t('warehouse.confirmDeleteWarehouse'),
    header: t('common.confirmation'),
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      try {
        await warehouseEntity.remove(selectedWarehouse.value._id);
        selectedWarehouseId.value = null;
        await loadWarehouses();
        if (warehouses.value.length) selectedWarehouseId.value = entitySelectValue(warehouses.value[0]);
        toast.add({ severity: 'success', summary: t('warehouse.messages.deleted'), life: 2000 });
      } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 });
      }
    }
  });
};

watch(selectedWarehouseId, (newId) => loadInventory(newId));

onMounted(async () => {
  await Promise.all([loadWarehouses(), loadCatalogs()]);
});
</script>
