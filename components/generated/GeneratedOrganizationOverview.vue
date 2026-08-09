<template>
  <EntityPage
    v-if="organization"
    :entity="organization"
    entity-type="organization"
    :show-status="false"
    :show-trace="false"
  >
    <ActionToolbar v-if="systemScreens.length" :title="$t('organization.workspace')">
      <template #actions>
        <Button
          v-for="item in systemScreens"
          :key="item.screenKey || item.route"
          :label="systemLabel(item.labelKey, item.screenKey)"
          :icon="item.icon || 'pi pi-arrow-right'"
          size="small"
          @click="router.push(item.route)"
        />
      </template>
    </ActionToolbar>

    <DataBlock
      entity-type="organization"
      :entity="organization"
      :fields="organizationFields"
    />
  </EntityPage>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { useAuthStore } from '~/stores/auth';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const props = defineProps({
  screen: { type: Object, required: true }
});

const router = useRouter();
const authStore = useAuthStore();
const { t, te } = useI18n();

const organization = computed(() => authStore.organizationData);
const systemScreens = computed(() => (props.screen.systemScreens || []).filter(item => item.route));
const organizationFields = resolveEntityDisplayFields({ entityType: 'organization', surface: 'detail' });

function systemLabel(key = '', fallback = '') {
  return key && te(key) ? t(key) : fallback || key;
}
</script>
