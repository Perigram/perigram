<template>
  <StandardPage :title="$t('packs.title')">
    <p class="text-supporting text-muted">{{ $t('packs.intro') }}</p>
    <TableFrame>
      <DataTable :value="packs" :loading="loading" stripedRows>
        <Column field="label" :header="$t('packs.pack')" sortable />
        <Column field="id" :header="$t('packs.id')">
          <template #body="{ data }">
            <span class="text-technical">{{ data.id }}</span>
          </template>
        </Column>
        <Column :header="$t('packs.requires')">
          <template #body="{ data }">
            <div class="flex flex-wrap gap-1">
              <Tag v-for="requirement in data.requires" :key="requirement" :value="requirement" severity="info" />
              <span v-if="!data.requires.length" class="text-muted text-supporting">—</span>
            </div>
          </template>
        </Column>
        <Column :header="$t('packs.requiredBy')">
          <template #body="{ data }">
            <div class="flex flex-wrap gap-1">
              <Tag v-for="consumer in data.requiredBy" :key="consumer" :value="consumer" severity="secondary" />
              <span v-if="!data.requiredBy.length" class="text-muted text-supporting">—</span>
            </div>
          </template>
        </Column>
        <Column :header="$t('packs.types')">
          <template #body="{ data }">
            <div class="flex flex-wrap gap-1">
              <Tag v-for="typeId in data.types" :key="typeId" :value="typeId" severity="contrast">
                {{ typeId }}
              </Tag>
            </div>
          </template>
        </Column>
        <Column :header="$t('packs.status')">
          <template #body>
            <Tag :value="$t('packs.mounted')" severity="success" />
          </template>
        </Column>
      </DataTable>
    </TableFrame>
  </StandardPage>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Tag from 'primevue/tag';
import StandardPage from '~/components/shared/StandardPage.vue';
import TableFrame from '~/components/shared/TableFrame.vue';

// Read-only pack inventory over GET /api/admin/packs: the mounted
// composition with requirements. Mounting itself is deploy-time
// (server/packs/declarations.js), so the page shows state, not switches.
definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { t } = useI18n();
const packs = ref([]);
const loading = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    const response = await $fetch('/api/admin/packs');
    packs.value = response.packs || [];
  } finally {
    loading.value = false;
  }
  void t;
});
</script>
