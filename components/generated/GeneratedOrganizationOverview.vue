<template>
  <StandardPage v-if="organization" :title="organizationName" :back="back">
    <template #actions>
      <!-- The record's conversation affordance: members open the
           organization's own instance thread from the record header. -->
      <InstanceChatEntry
        type-id="organization"
        :instance="organization"
        :name="organizationName"
        data-testid="org-overview-chat"
      />
      <Button
        v-for="item in systemScreens"
        :key="item.screenKey || item.route"
        :label="systemLabel(item.labelKey, item.screenKey)"
        :icon="item.icon || 'pi pi-arrow-right'"
        size="small"
        @click="openSystemScreen(item)"
      />
    </template>

    <DataBlock
      type-id="organization"
      :entity="organization"
      :fields="organizationFields"
    />
  </StandardPage>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import StandardPage from '~/components/shared/StandardPage.vue';
import InstanceChatEntry from '~/components/shared/InstanceChatEntry.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { useAuthStore } from '~/stores/auth';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { workspacePageIdForRoute } from '~/components/generated/workspace-pages.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';

const props = defineProps({
  screen: { type: Object, required: true },
  // Routed-surface back control; the pane renders this surface bare.
  back: { type: Object, default: null }
});

const authStore = useAuthStore();
const { t, te } = useI18n();

const organization = computed(() => authStore.organizationData);
const organizationName = computed(() => organization.value?.identity?.name || '');

const systemScreens = computed(() => (props.screen.systemScreens || []).filter(item => item.route));
const { typeById } = useFileTypeView();
const organizationFields = computed(() => resolveInstanceDisplayFields({ typeId: 'organization', surface: 'detail', typeRecord: typeById('organization') }));

function systemLabel(key = '', fallback = '') {
  return key && te(key) ? t(key) : fallback || key;
}

// System screens open inside the home workspace through the page-open
// seam: every management surface (team, partners, billing, plugins, the
// process designer) is a registered workspace page.
function openSystemScreen(item = {}) {
  const pageId = workspacePageIdForRoute(item.route || '');
  if (pageId) {
    openWorkspacePageFromChrome({ pageId, route: item.route });
  }
}
</script>
