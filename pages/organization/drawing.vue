<template>
  <StandardPage :title="$t('drawing.title')">
    <template #actions>
      <Button :label="$t('common.create')" icon="pi pi-plus" @click="openPenDialog()" />
    </template>

    <Tabs v-model:value="activeTab" value="pens">
      <TabList>
        <Tab value="pens"><i class="pi pi-pencil mr-2" />{{ $t('drawing.pens') }}</Tab>
        <Tab value="standards"><i class="pi pi-list mr-2" />{{ $t('drawing.standards') }}</Tab>
      </TabList>
    </Tabs>

    <div v-if="activeTab === 'pens'" class="flex flex-col gap-4">
      <ActionToolbar :title="$t('drawing.penCatalogue')" />
      <TableFrame>
        <DataTable :value="penStore.pens" :loading="penStore.loading" stripedRows>
          <Column :header="$t('drawing.stroke')">
            <template #body="{ data }">
              <StrokePreview :stroke="data.data?.stroke" class="w-40" />
            </template>
          </Column>
          <Column field="identity.name" :header="$t('profile.name')" sortable />
          <Column :header="$t('drawing.weight')">
            <template #body="{ data }">
              <span class="text-technical">{{ weightLabel(data.data?.stroke?.weight) }}</span>
            </template>
          </Column>
          <Column :header="$t('common.type')">
            <template #body="{ data }">
              <Tag :value="data.lineage?.organizationId == null ? $t('drawing.system') : $t('drawing.organization')" severity="secondary" />
            </template>
          </Column>
          <Column class="text-right">
            <template #body="{ data }">
              <div class="flex justify-end gap-2">
                <Button icon="pi pi-pencil" text @click="openPenDialog(data)" v-tooltip.top="$t('common.update')" />
                <Button icon="pi pi-trash" text severity="danger" @click="confirmPenDelete(data)" v-tooltip.top="$t('common.delete')" />
              </div>
            </template>
          </Column>
        </DataTable>
      </TableFrame>
    </div>

    <div v-else class="flex flex-col gap-4">
      <ActionToolbar :title="$t('drawing.standardCatalogue')" />
      <TableFrame>
        <DataTable :value="standardStore.standards" :loading="standardStore.loading" stripedRows>
          <Column field="data.code" :header="$t('drawing.code')" sortable />
          <Column :header="$t('drawing.category')">
            <template #body="{ data }">
              <Tag :value="data.data?.category" severity="info" />
            </template>
          </Column>
          <Column field="data.description" :header="$t('drawing.description')" />
          <Column :header="$t('drawing.defaultPen')">
            <template #body="{ data }">
              <div v-if="penFor(data)" class="flex items-center gap-2">
                <StrokePreview :stroke="penFor(data).data?.stroke" class="w-24" />
                <span class="text-supporting truncate">{{ penFor(data).identity?.name }}</span>
              </div>
              <span v-else class="text-muted text-supporting">{{ $t('drawing.noDefaultPen') }}</span>
            </template>
          </Column>
          <Column :header="$t('common.actions.title')" class="text-right">
            <template #body="{ data }">
              <div class="flex justify-end gap-2">
                <Button
                  icon="pi pi-pencil"
                  text
                  :disabled="penOptions.length === 0"
                  @click="openPenOverride(data)"
                  v-tooltip.top="$t('drawing.setOrgPen')"
                />
                <Button
                  v-if="data._id && isOrgShadowed(data)"
                  icon="pi pi-undo"
                  text
                  severity="secondary"
                  @click="resetOrgPen(data)"
                  v-tooltip.top="$t('drawing.resetOrgPen')"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </TableFrame>
    </div>

    <StandardDialog v-model:visible="showPenDialog" :header="editingPenId ? $t('common.update') : $t('drawing.newPen')" size="sm">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('profile.name') }}</label>
          <InputText v-model="penForm.name" :placeholder="$t('assets.placeholders.penName')" autofocus />
        </div>
        <div class="flex items-center gap-3">
          <label>{{ $t('drawing.color') }}</label>
          <ColorPicker v-model="penForm.stroke.color" />
          <span class="w-swatch h-swatch border rounded-ui" :style="{ backgroundColor: penForm.stroke.color }" />
        </div>
        <div class="flex items-center gap-3">
          <label>{{ $t('drawing.weight') }}</label>
          <InputNumber v-model="penForm.stroke.weight" :min="0.1" :max="10" :step="0.05" mode="decimal" :minFractionDigits="2" suffix=" mm" />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('drawing.pattern') }}</label>
          <div class="flex gap-2">
            <Button
              v-for="pattern in PATTERNS"
              :key="pattern"
              :severity="penForm.stroke.pattern === pattern ? 'primary' : 'secondary'"
              :outlined="penForm.stroke.pattern !== pattern"
              size="small"
              :aria-label="pattern"
              @click="penForm.stroke.pattern = pattern"
            >
              <svg width="64" height="12" viewBox="0 0 64 12" aria-hidden="true">
                <line x1="2" y1="6" x2="62" y2="6" :stroke="penForm.stroke.color" :stroke-width="2" :stroke-dasharray="dashArray(pattern, 2)" stroke-linecap="round" />
              </svg>
            </Button>
          </div>
        </div>
        <StrokePreview :stroke="penForm.stroke" class="w-full" />
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="showPenDialog = false" />
        <Button :label="$t('common.save')" :loading="saving" :disabled="!penForm.name" @click="savePen" />
      </template>
    </StandardDialog>

    <StandardDialog v-model:visible="showOverrideDialog" :header="$t('drawing.setOrgPen')" size="sm">
      <div class="flex flex-col gap-3">
        <p class="text-supporting text-muted">{{ $t('drawing.orgPenHint', { code: overrideStandard?.data?.code }) }}</p>
        <div class="flex items-center gap-3">
          <label>{{ $t('drawing.defaultPen') }}</label>
          <Select
            v-model="overridePenId"
            :options="penOptions"
            option-label="label"
            option-value="value"
            :placeholder="$t('drawing.choosePen')"
            class="flex-1"
          />
        </div>
        <div v-if="overridePen" class="flex items-center gap-2">
          <StrokePreview :stroke="overridePen.data?.stroke" class="w-24" />
          <span class="text-supporting truncate">{{ overridePen.identity?.name }}</span>
        </div>
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="showOverrideDialog = false" />
        <Button :label="$t('common.save')" :loading="saving" :disabled="!overridePenId" @click="saveOverride" />
      </template>
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import ColorPicker from 'primevue/colorpicker';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import Tabs from 'primevue/tabs';
import Tag from 'primevue/tag';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import Select from '~/components/shared/EntitySelect.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StrokePreview from '~/components/drawing/StrokePreview.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import { dashArray } from '~/utils/stroke-patterns.js';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';

// Drawing reference management over the tech-drawing pack's types: pens
// (full CRUD with the color/pattern pickers) and layer standards (default
// pen resolved through the declared relation; org overrides shadow by
// code, system rows are never mutated).
definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const PATTERNS = ['SOLID', 'DASHED', 'DOTTED'];

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const penStore = usePenTemplatesStore();
const standardStore = useLayerStandardsStore();

const activeTab = ref('pens');
const showPenDialog = ref(false);
const showOverrideDialog = ref(false);
const editingPenId = ref(null);
const saving = ref(false);
const penForm = ref({ name: '', stroke: { color: '#2563EB', weight: 0.35, pattern: 'SOLID' } });
const overrideStandard = ref(null);
const overridePenId = ref(null);

const penOptions = computed(() => penStore.pens.map(pen => ({
  label: pen.identity?.name || pen._id,
  value: pen._id,
  entity: pen
})));
const overridePen = computed(() => penStore.pens.find(pen => pen._id === overridePenId.value) || null);

function penFor(standard) {
  const id = standard.data?.defaultPenId;
  return id ? penStore.pens.find(pen => String(pen._id) === String(id)) || null : null;
}

function isOrgShadowed(standard) {
  return standard.lineage?.organizationId != null;
}

function weightLabel(weight) {
  return Number.isFinite(Number(weight)) ? `${Number(weight).toFixed(2)} mm` : '—';
}

function openPenDialog(pen = null) {
  editingPenId.value = pen?._id || null;
  penForm.value = pen?.data?.stroke
    ? { name: pen.identity?.name || '', stroke: { ...pen.data.stroke } }
    : { name: '', stroke: { color: '#2563EB', weight: 0.35, pattern: 'SOLID' } };
  showPenDialog.value = true;
}

async function savePen() {
  saving.value = true;
  try {
    if (editingPenId.value) {
      await penStore.updatePen(editingPenId.value, penForm.value);
    } else {
      await penStore.createPen(penForm.value);
    }
    showPenDialog.value = false;
    await penStore.fetchPens();
    toast.add({ severity: 'success', summary: t('common.success'), life: 2000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message, life: 4000 });
  } finally {
    saving.value = false;
  }
}

function confirmPenDelete(pen) {
  confirm.require({
    message: t('messages.confirmDelete'),
    header: t('common.confirmation'),
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      try {
        await penStore.deletePen(pen._id);
        await penStore.fetchPens();
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('common.delete'), life: 2000 });
      } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message, life: 4000 });
      }
    }
  });
}

function openPenOverride(standard) {
  overrideStandard.value = standard;
  overridePenId.value = standard.data?.defaultPenId || null;
  showOverrideDialog.value = true;
}

async function saveOverride() {
  if (!overrideStandard.value) return;
  saving.value = true;
  try {
    await standardStore.setOrgPenOverride(overrideStandard.value._id, overridePenId.value);
    showOverrideDialog.value = false;
    await standardStore.fetchStandards();
    toast.add({ severity: 'success', summary: t('common.success'), life: 2000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message, life: 4000 });
  } finally {
    saving.value = false;
  }
}

async function resetOrgPen(standard) {
  const system = standardStore.standards.find(candidate => (
    candidate.data?.code === standard.data?.code && candidate.lineage?.organizationId == null
  ));
  try {
    await standardStore.removeOrgPenOverride(system?._id || standard._id);
    await standardStore.fetchStandards();
    toast.add({ severity: 'success', summary: t('common.success'), life: 2000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message, life: 4000 });
  }
}

onMounted(async () => {
  await Promise.all([penStore.ensurePens(), standardStore.ensureStandards()]);
});
</script>
