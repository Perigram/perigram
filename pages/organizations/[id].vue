<template>
  <StandardPage :title="entry?.identity?.name || $t('auth.organization')">
    <template #actions>
      <template v-if="entry?.directory?.isMember">
        <Button
          v-if="isActiveOrganization"
          :label="$t('profile.viewOrganization')"
          icon="pi pi-arrow-right"
          @click="router.push(organizationOverviewRoute)"
        />
        <Button
          v-else
          :label="$t('profile.switchOrganization')"
          icon="pi pi-arrow-right-arrow-left"
          :loading="switching"
          @click="switchToOrganization"
        />
      </template>
      <template v-else-if="canManagePartnerships">
        <Button
          v-if="!partnership"
          :label="$t('partnerships.addPartner')"
          icon="pi pi-handshake"
          :loading="requesting"
          data-testid="org-partner-request"
          @click="requestPartnership"
        />
        <template v-else-if="partnership.status === 'pending'">
          <Button
            v-if="partnership.direction === 'incoming'"
            :label="$t('common.approve')"
            icon="pi pi-check"
            :loading="responding"
            data-testid="org-partner-accept"
            @click="respondPartnership('accept')"
          />
          <Button
            :label="partnership.direction === 'incoming' ? $t('common.reject') : $t('common.cancel')"
            icon="pi pi-times"
            severity="danger"
            text
            :loading="responding"
            @click="respondPartnership(partnership.direction === 'incoming' ? 'decline' : 'cancel')"
          />
        </template>
        <Button
          v-else-if="partnership.status === 'active'"
          :label="$t('partnerships.terminate')"
          icon="pi pi-times"
          severity="danger"
          text
          :loading="responding"
          @click="respondPartnership('cancel')"
        />
      </template>
    </template>

    <div v-if="loading">
      <StateBlock loading />
    </div>
    <div v-else-if="!entry">
      <StateBlock :message="$t('common.notAvailable')" />
    </div>
    <div v-else class="grid grid-cols-1 gap-6 py-4 md:grid-cols-12">
      <div class="md:col-span-4">
        <OrganizationCard :organization="organization" />
      </div>
      <div class="flex flex-col gap-6 md:col-span-8">
        <Panel v-if="detailedFields.length" :header="$t('organization.details')">
          <DataBlock type-id="organization" :entity="detailed" :fields="detailedFields" />
        </Panel>
        <Panel v-if="partnership" :header="$t('partnerships.title')">
          <div class="flex items-center gap-2 py-2">
            <Tag :value="$t(`partnerships.status.${partnership.status}`)" :severity="partnershipSeverity" />
            <small v-if="partnership.direction === 'incoming'" class="text-muted">{{ $t('partnerships.incoming') }}</small>
            <small v-else class="text-muted">{{ $t('partnerships.outgoing') }}</small>
          </div>
        </Panel>
      </div>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import OrganizationCard from '~/components/entities/Organization/OrganizationCard.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();
const { t } = useI18n();

const entry = ref(null);
const detailed = ref({});
const partnerships = ref([]);
const loading = ref(true);
const requesting = ref(false);
const responding = ref(false);
const switching = ref(false);

const { typeById } = useFileTypeView();
// The card renders the union: the directory card is the baseline and the
// grant-redacted organization DTO deep-merges over it for members.
const organization = computed(() => ({
  ...entry.value,
  ...detailed.value,
  identity: { ...(entry.value?.identity || {}), ...(detailed.value?.identity || {}) },
  data: { ...(entry.value?.data || {}), ...(detailed.value?.data || {}) }
}));
const detailedFields = computed(() => (detailed.value?._id
  ? resolveInstanceDisplayFields({ typeId: 'organization', surface: 'card', typeRecord: typeById('organization') })
  : []));
const activeOrganizationId = computed(() =>
  authStore.organizationData?._id
  || authStore.userData?.organizationId
  || null);
const isActiveOrganization = computed(() =>
  Boolean(activeOrganizationId.value)
  && String(entry.value?._id) === String(activeOrganizationId.value));
const canManagePartnerships = computed(() => Boolean(
  activeOrganizationId.value
  && !isActiveOrganization.value
  && authStore.can('organizations', 'admin')
));
const partnership = computed(() => partnerships.value.find(item =>
  String(item.partnerOrganization?._id) === String(entry.value?._id)
) || null);
const partnershipSeverity = computed(() => ({
  pending: 'warn',
  active: 'success',
  declined: 'danger',
  terminated: 'secondary'
}[partnership.value?.status] || 'secondary'));
const organizationOverviewRoute = computed(() => '/organization');

onMounted(async () => {
  const id = route.params.id;
  try {
    const [entryResponse, detailedResponse, partnershipList] = await Promise.all([
      $fetch(`/api/directory/organization/${id}`),
      $fetch(`/api/organizations/${id}`).catch(() => ({})),
      activeOrganizationId.value
        ? $fetch('/api/partnerships').catch(() => [])
        : Promise.resolve([])
    ]);
    entry.value = entryResponse;
    detailed.value = detailedResponse || {};
    partnerships.value = partnershipList || [];
  } catch (error) {
    if (error?.statusCode === 404) {
      showToastError(t('common.notAvailable'));
    } else {
      showToastError(error?.data?.message || error.message);
    }
  } finally {
    loading.value = false;
  }
});

async function requestPartnership() {
  requesting.value = true;
  try {
    await $fetch('/api/partnerships', {
      method: 'POST',
      body: { partnerOrganizationId: entry.value?._id }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('partnerships.requestSent'), life: 3000 });
    await reloadPartnerships();
  } catch (error) {
    showToastError(error?.data?.message || error.message);
  } finally {
    requesting.value = false;
  }
}

async function respondPartnership(action) {
  if (action === 'cancel' && !window.confirm(t('partnerships.cancelConfirm'))) return;
  responding.value = true;
  try {
    if (action === 'accept' || action === 'decline') {
      await $fetch(`/api/partnerships/${partnership.value._id}/${action}`, { method: 'POST' });
    } else {
      await $fetch(`/api/partnerships/${partnership.value._id}`, { method: 'DELETE' });
    }
    await reloadPartnerships();
  } catch (error) {
    showToastError(error?.data?.message || error.message);
  } finally {
    responding.value = false;
  }
}

async function reloadPartnerships() {
  if (!activeOrganizationId.value) return;
  partnerships.value = await $fetch('/api/partnerships').catch(() => []);
}

async function switchToOrganization() {
  switching.value = true;
  try {
    await authStore.switchOrganization(entry.value?._id);
    router.push(organizationOverviewRoute.value);
  } catch (error) {
    showToastError(error?.data?.message || error.message);
  } finally {
    switching.value = false;
  }
}

function showToastError(detail) {
  toast.add({ severity: 'error', summary: t('common.error'), detail, life: 3000 });
}
</script>
