<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-col gap-2 border-b pb-4">
      <h1 class="m-0">{{ $t('uiLab.sections.primitives') }}</h1>
      <p class="m-0 text-muted-color">{{ $t('uiLab.subtitle') }}</p>
    </header>

    <DataTable :value="rows" size="small">
      <Column :header="$t('uiLab.contract.entity')">
        <template #body="{ data }">
          <div class="flex flex-col">
            <span>{{ $t(data.labelKey) }}</span>
            <small class="text-muted-color">{{ data.entityType }}</small>
          </div>
        </template>
      </Column>
      <Column :header="$t('uiLab.variants.inline')">
        <template #body="{ data }">
          <component :is="data.component" v-bind="data.props" variant="inline" />
        </template>
      </Column>
      <Column :header="$t('uiLab.variants.compact')">
        <template #body="{ data }">
          <component :is="data.component" v-bind="data.props" variant="compact" />
        </template>
      </Column>
      <Column :header="$t('uiLab.variants.card')">
        <template #body="{ data }">
          <div class="max-w-sm">
            <component :is="data.component" v-bind="data.props" variant="card" />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'ui-lab-layout' });

import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { createDesignSystemDemoRows } from '~/utils/design-system.js';

const rows = createDesignSystemDemoRows();
</script>
