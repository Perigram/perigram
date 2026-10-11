<template>
  <InstancePage
    v-if="organization"
    :instance="organization"
    type-id="organization"
    :show-status="false"
    :show-trace="false"
    actions-display="inline"
  >
    <template v-if="systemScreens.length || organization" #actions>
      <!-- The record's conversation affordance: members open the
           organization's own instance thread from the record header
           (detail-surface conversation contract). -->
      <Button
        icon="pi pi-comments"
        text
        severity="secondary"
        size="small"
        :aria-label="$t('support.openChat')"
        data-testid="org-overview-chat"
        @click="openOrgChat"
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
  </InstancePage>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import InstancePage from '~/components/shared/InstancePage.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { useAuthStore } from '~/stores/auth';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { openInstanceChat } from '~/utils/instance-chat.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { workspacePageIdForRoute } from '~/components/generated/workspace-pages.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';

const props = defineProps({
  screen: { type: Object, required: true }
});

const authStore = useAuthStore();
const { t, te } = useI18n();

const organization = computed(() => authStore.organizationData);

function openOrgChat() {
  if (!organization.value?._id) return;
  openInstanceChat({
    type: 'organization',
    id: organization.value._id,
    name: organization.value.identity?.name || ''
  });
}
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
