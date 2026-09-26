<template>
  <InstancePage
    v-if="organization"
    :instance="organization"
    type-id="organization"
    :show-status="false"
    :show-trace="false"
    actions-display="inline"
  >
    <template v-if="systemScreens.length" #actions>
      <Button
        v-for="item in systemScreens"
        :key="item.screenKey || item.route"
        :label="systemLabel(item.labelKey, item.screenKey)"
        :icon="item.icon || 'pi pi-arrow-right'"
        size="small"
        @click="router.push(item.route)"
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
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import InstancePage from '~/components/shared/InstancePage.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { useAuthStore } from '~/stores/auth';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

const props = defineProps({
  screen: { type: Object, required: true }
});

const router = useRouter();
const authStore = useAuthStore();
const { t, te } = useI18n();

const organization = computed(() => authStore.organizationData);
const systemScreens = computed(() => (props.screen.systemScreens || []).filter(item => item.route));
const { typeById } = useFileTypeView();
const organizationFields = computed(() => resolveInstanceDisplayFields({ typeId: 'organization', surface: 'detail', typeRecord: typeById('organization') }));

function systemLabel(key = '', fallback = '') {
  return key && te(key) ? t(key) : fallback || key;
}
</script>
