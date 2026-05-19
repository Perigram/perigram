<template>
  <StandardPage :title="$t('admin.workbench.title')" :subtitle="$t('admin.workbench.subtitle')">
    <template #actions>
      <Button icon="pi pi-external-link" :label="$t('admin.workbench.openStandalone')" severity="secondary" @click="openStandalone" />
    </template>

    <div class="flex flex-col gap-6">
      <Panel :header="$t('admin.workbench.sections')">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <button
            v-for="tool in tools"
            :key="tool.id"
            type="button"
            class="flex flex-col gap-2 rounded-ui border border-content-border bg-content p-4 text-left"
            :class="activeToolId === tool.id ? 'border-primary' : ''"
            @click="activeToolId = tool.id"
          >
            <span class="flex items-center gap-2 font-semibold">
              <i :class="tool.icon" />
              {{ $t(tool.titleKey) }}
            </span>
            <small class="text-muted-color">{{ $t(tool.descriptionKey) }}</small>
            <Tag :value="tool.path" severity="secondary" size="small" />
          </button>
        </div>
      </Panel>

      <Panel>
        <template #header>
          <div class="flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div class="flex flex-col gap-1">
              <span>{{ $t(activeTool.titleKey) }}</span>
              <small class="text-muted-color">{{ $t(activeTool.descriptionKey) }}</small>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                v-for="tool in primaryTools"
                :key="tool.id"
                :label="$t(tool.shortKey)"
                :icon="tool.icon"
                :severity="activeToolId === tool.id ? 'primary' : 'secondary'"
                size="small"
                @click="activeToolId = tool.id"
              />
            </div>
          </div>
        </template>

        <component :is="activeTool.component" />
      </Panel>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, defineAsyncComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import StandardPage from '~/components/shared/StandardPage.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const router = useRouter();

const tools = [
  {
    id: 'domain-builder',
    path: '/admin/domain-builder',
    icon: 'pi pi-sitemap',
    titleKey: 'admin.domainBuilder.title',
    shortKey: 'admin.workbench.short.workflows',
    descriptionKey: 'admin.workbench.tools.domainBuilder',
    component: defineAsyncComponent(() => import('~/pages/admin/domain-builder.vue'))
  },
  {
    id: 'data-model',
    path: '/admin/data-model-review',
    icon: 'pi pi-database',
    titleKey: 'admin.dataModelReview.title',
    shortKey: 'admin.workbench.short.dataModel',
    descriptionKey: 'admin.workbench.tools.dataModel',
    component: defineAsyncComponent(() => import('~/pages/admin/data-model-review.vue'))
  },
  {
    id: 'ui-lab',
    path: '/test/ui-lab',
    icon: 'pi pi-desktop',
    titleKey: 'uiLab.title',
    shortKey: 'admin.workbench.short.ui',
    descriptionKey: 'admin.workbench.tools.uiLab',
    component: defineAsyncComponent(() => import('~/pages/test/ui-lab.vue'))
  },
  {
    id: 'variant-showcase',
    path: '/test/components/VariantShowcase',
    icon: 'pi pi-table',
    titleKey: 'admin.workbench.variantShowcase',
    shortKey: 'admin.workbench.short.variants',
    descriptionKey: 'admin.workbench.tools.variantShowcase',
    component: defineAsyncComponent(() => import('~/pages/test/components/VariantShowcase.vue'))
  },
  {
    id: 'diagnostics',
    path: '/admin/diagnostics',
    icon: 'pi pi-chart-line',
    titleKey: 'admin.systemDiagnostics',
    shortKey: 'admin.workbench.short.diagnostics',
    descriptionKey: 'admin.workbench.tools.diagnostics',
    component: defineAsyncComponent(() => import('~/pages/admin/diagnostics.vue'))
  },
  {
    id: 'users',
    path: '/admin/users',
    icon: 'pi pi-users',
    titleKey: 'features.users',
    shortKey: 'admin.workbench.short.users',
    descriptionKey: 'admin.workbench.tools.users',
    component: defineAsyncComponent(() => import('~/pages/admin/users.vue'))
  },
  {
    id: 'organizations',
    path: '/admin/organizations',
    icon: 'pi pi-building',
    titleKey: 'features.organizations',
    shortKey: 'admin.workbench.short.organizations',
    descriptionKey: 'admin.workbench.tools.organizations',
    component: defineAsyncComponent(() => import('~/pages/admin/organizations.vue'))
  },
  {
    id: 'support',
    path: '/admin/support',
    icon: 'pi pi-comments',
    titleKey: 'admin.supportChat',
    shortKey: 'admin.workbench.short.support',
    descriptionKey: 'admin.workbench.tools.support',
    component: defineAsyncComponent(() => import('~/pages/admin/support.vue'))
  }
];

const activeToolId = ref('domain-builder');
const activeTool = computed(() => tools.find(tool => tool.id === activeToolId.value) || tools[0]);
const primaryTools = computed(() => tools.slice(0, 4));

function openStandalone() {
  router.push(activeTool.value.path);
}
</script>
