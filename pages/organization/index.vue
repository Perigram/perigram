<template>
  <StandardPage :title="$t('organization.workspace')" :subtitle="organizationName">
    <ResponsiveGrid variant="wide">
      <Panel>
        <div class="flex h-full flex-col gap-4">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h2 class="m-0 text-base">{{ $t('billing.organizationAccount') }}</h2>
              <small class="text-muted-color">{{ $t('billing.organizationAccountHint') }}</small>
            </div>
            <Tag :value="billingAccount?.status || $t('common.loading')" severity="info" />
          </div>
          <div class="flex items-end justify-between gap-3">
            <div class="flex flex-col gap-1">
              <small class="text-muted-color">{{ $t('billing.tokenBalance') }}</small>
              <span class="text-4xl font-bold">{{ billingAccount?.balance ?? 0 }}</span>
            </div>
            <Button icon="pi pi-refresh" :label="$t('common.refresh')" size="small" text :loading="loadingBilling" @click="loadBilling" />
          </div>
          <Message v-if="billingError" severity="error">{{ billingError }}</Message>
        </div>
      </Panel>

      <Panel>
        <div class="flex h-full flex-col gap-4">
          <div class="flex items-center gap-3">
            <i class="pi pi-shopping-cart text-xl text-primary" aria-hidden="true"></i>
            <div class="min-w-0">
              <h2 class="m-0 text-base">{{ $t('billing.tokenPackages') }}</h2>
              <small class="text-muted-color">{{ $t('billing.tokenPackagesHint') }}</small>
            </div>
          </div>
          <div v-if="packages.length" class="flex flex-col gap-2">
            <div v-for="pack in packages" :key="pack.id" class="flex items-center justify-between gap-3 rounded-md border border-surface-200 p-3 dark:border-surface-700">
              <div class="min-w-0">
                <p class="m-0 font-medium">{{ pack.label }}</p>
                <small class="text-muted-color">{{ pack.tokenAmount }} {{ $t('billing.tokens') }}</small>
              </div>
              <Button icon="pi pi-credit-card" :label="$t('billing.buyNow')" size="small" :loading="checkoutPackageId === pack.id" @click="startCheckout(pack.id)" />
            </div>
          </div>
          <StateBlock v-else :message="$t('billing.noPackages')" icon="pi pi-box" />
        </div>
      </Panel>

      <Panel>
        <div class="flex h-full flex-col gap-4">
          <div class="flex items-center gap-3">
            <i class="pi pi-users text-xl text-primary" aria-hidden="true"></i>
            <div class="min-w-0">
              <h2 class="m-0 text-base">{{ $t('organization.teamManagement') }}</h2>
              <small class="text-muted-color">{{ $t('organization.teamManagementHint') }}</small>
            </div>
          </div>
          <div class="mt-auto">
            <Button icon="pi pi-arrow-right" :label="$t('organization.openTeam')" size="small" @click="navigateTo('/organization/users')" />
          </div>
        </div>
      </Panel>

      <Panel>
        <div class="flex h-full flex-col gap-4">
          <div class="flex items-center gap-3">
            <i class="pi pi-sitemap text-xl text-primary" aria-hidden="true"></i>
            <div class="min-w-0">
              <h2 class="m-0 text-base">{{ $t('processDesigner.title') }}</h2>
              <small class="text-muted-color">{{ $t('organization.processDesignerHint') }}</small>
            </div>
          </div>
          <div class="mt-auto">
            <Button icon="pi pi-arrow-right" :label="$t('organization.openProcessDesigner')" size="small" @click="navigateTo('/organization/process')" />
          </div>
        </div>
      </Panel>
    </ResponsiveGrid>

    <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Panel :header="$t('billing.invoices')">
        <div v-if="invoices.length" class="flex flex-col gap-2">
          <div v-for="invoice in invoices" :key="invoice._id" class="flex items-center justify-between gap-3 border-b border-surface-100 py-2 last:border-b-0 dark:border-surface-800">
            <div class="min-w-0">
              <p class="m-0 font-medium">{{ invoice.tokenAmount }} {{ $t('billing.tokens') }}</p>
              <small class="text-muted-color">{{ formatDate(invoice.createdAt) }}</small>
            </div>
            <Tag :value="invoice.status" :severity="invoice.status === 'paid' ? 'success' : 'warn'" />
          </div>
        </div>
        <StateBlock v-else :message="$t('billing.noHistory')" icon="pi pi-history" />
      </Panel>

      <Panel :header="$t('billing.ledger')">
        <div v-if="ledger.length" class="flex flex-col gap-2">
          <div v-for="entry in ledger" :key="entry._id" class="flex items-center justify-between gap-3 border-b border-surface-100 py-2 last:border-b-0 dark:border-surface-800">
            <div class="min-w-0">
              <p class="m-0 font-medium">{{ $t(`billing.ledgerTypes.${entry.type}`) }}</p>
              <small class="text-muted-color">{{ formatDate(entry.createdAt) }}</small>
            </div>
            <Tag :value="formatAmount(entry.amount)" :severity="entry.amount >= 0 ? 'success' : 'secondary'" />
          </div>
        </div>
        <StateBlock v-else :message="$t('billing.noLedger')" icon="pi pi-list" />
      </Panel>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const authStore = useAuthStore();
const organizationName = computed(() => authStore.organizationData?.identity?.name || authStore.organizationData?.name || '');
const organizationId = computed(() => authStore.organizationData?._id || authStore.userData?.organizationId || authStore.user?.organizationId);
const toast = useToast();
const route = useRoute();
const { t } = useI18n();

const loadingBilling = ref(false);
const billingError = ref('');
const billingAccount = ref(null);
const packages = ref([]);
const invoices = ref([]);
const ledger = ref([]);
const checkoutPackageId = ref('');

onMounted(async () => {
  await Promise.all([loadBilling(), loadPackages()]);
  if (route.query.checkoutInternalId) await syncCheckout(route.query.checkoutInternalId);
});

async function loadBilling() {
  if (!organizationId.value) return;
  loadingBilling.value = true;
  billingError.value = '';
  try {
    const data = await $fetch(`/api/organizations/${organizationId.value}/billing/account`);
    billingAccount.value = data.account;
    invoices.value = data.invoices || [];
    ledger.value = data.ledger || [];
  } catch (error) {
    billingError.value = error?.data?.message || error.message || '';
  } finally {
    loadingBilling.value = false;
  }
}

async function loadPackages() {
  if (!organizationId.value) return;
  try {
    const data = await $fetch(`/api/organizations/${organizationId.value}/billing/packages`);
    packages.value = data.packages || [];
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  }
}

async function startCheckout(packageId) {
  checkoutPackageId.value = packageId;
  try {
    const data = await $fetch(`/api/organizations/${organizationId.value}/billing/checkout`, {
      method: 'POST',
      body: { packageId }
    });
    window.location.href = data.checkoutUrl;
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    checkoutPackageId.value = '';
  }
}

async function syncCheckout(checkoutInternalId) {
  try {
    await $fetch(`/api/organizations/${organizationId.value}/billing/check`, {
      method: 'POST',
      body: { checkoutInternalId }
    });
    await loadBilling();
  } catch (error) {
    billingError.value = error?.data?.message || error.message || '';
  }
}

function formatAmount(amount) {
  const value = Number(amount) || 0;
  return `${value > 0 ? '+' : ''}${value}`;
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

</script>
