<template>
  <div class="flex flex-col gap-6">
    <ResponsiveGrid v-if="mainRegions.length" variant="wide">
      <Panel v-if="hasRegion('billingAccount')">
        <div class="flex h-full flex-col gap-4">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h2 class="m-0 text-section-heading">{{ $t('billing.organizationAccount') }}</h2>
              <small class="text-muted-color">{{ $t('billing.organizationAccountHint') }}</small>
            </div>
            <Tag v-if="currentTariffLabel" :value="currentTariffLabel" severity="info" />
          </div>
          <div class="flex items-end justify-between gap-3">
            <div class="flex flex-col gap-1">
              <small class="text-muted-color">{{ $t('billing.tokenBalance') }}</small>
              <span class="text-metric">{{ billingAccount?.balance ?? 0 }}</span>
            </div>
            <Button icon="pi pi-refresh" :label="$t('common.refresh')" size="small" text :loading="loadingBilling" @click="loadBilling" />
          </div>
          <Message severity="secondary" :closable="false">{{ $t('billing.tokensExplanation') }}</Message>
          <Message v-if="billingError" severity="error">{{ billingError }}</Message>
        </div>
      </Panel>

      <Panel v-if="hasRegion('billingPackages')">
        <div class="flex h-full flex-col gap-4">
          <div class="flex items-center gap-3">
            <i class="pi pi-shopping-cart text-[var(--ck-primary-ink)]" aria-hidden="true"></i>
            <div class="min-w-0">
              <h2 class="m-0 text-section-heading">{{ $t('billing.tokenPackages') }}</h2>
              <small class="text-muted-color">{{ $t('billing.tokenPackagesHint') }}</small>
            </div>
          </div>
          <div v-if="packages.length" class="flex flex-col gap-2">
            <div v-for="pack in packages" :key="pack.id" class="flex items-center justify-between gap-3 border border-content-border p-3">
              <div class="min-w-0">
                <p class="m-0 text-label">{{ packageLabel(pack) }}</p>
                <small class="text-muted-color">{{ pack.tokenAmount }} {{ $t('billing.tokens') }}</small>
              </div>
              <Button
                v-if="canCheckout"
                icon="pi pi-credit-card"
                :label="$t('billing.buyNow')"
                size="small"
                :loading="checkoutPackageId === pack.id"
                @click="startCheckout(pack.id)"
              />
            </div>
          </div>
          <StateBlock v-else :message="$t('billing.noPackages')" icon="pi pi-box" />
        </div>
      </Panel>

    </ResponsiveGrid>

    <div v-if="supportingRegions.length" class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Panel v-if="hasRegion('billingInvoices')" :header="$t('billing.invoices')">
        <div v-if="invoices.length" class="flex flex-col gap-2">
          <div v-for="invoice in invoices" :key="invoice._id" class="flex items-center justify-between gap-3 border-b border-content-border py-2 last:border-b-0">
            <div class="min-w-0">
              <p class="m-0 text-label">{{ invoice.tokenAmount }} {{ $t('billing.tokens') }}</p>
              <small class="text-muted-color">{{ formatDate(invoice.createdAt) }}</small>
            </div>
            <Tag :value="billingStatusLabel(invoice.status)" :severity="invoice.status === 'paid' ? 'success' : 'warn'" />
          </div>
        </div>
        <StateBlock v-else :message="$t('billing.noHistory')" icon="pi pi-history" />
      </Panel>

      <Panel v-if="hasRegion('billingLedger')" :header="$t('billing.ledger')">
        <div v-if="ledger.length" class="flex flex-col gap-2">
          <div v-for="entry in ledger" :key="entry._id" class="flex items-center justify-between gap-3 border-b border-content-border py-2 last:border-b-0">
            <div class="min-w-0">
              <p class="m-0 text-label">{{ ledgerTypeLabel(entry.type) }}</p>
              <small class="text-muted-color">{{ formatDate(entry.createdAt) }}</small>
            </div>
            <Tag :value="formatAmount(entry.amount)" :severity="entry.amount >= 0 ? 'success' : 'secondary'" />
          </div>
        </div>
        <StateBlock v-else :message="$t('billing.noLedger')" icon="pi pi-list" />
      </Panel>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useAuthStore } from '~/stores/auth';
import { currentTariffLabel as resolveCurrentTariffLabel } from '~/utils/billing-presentation.js';

const props = defineProps({
  screen: { type: Object, required: true }
});

const route = useRoute();
const authStore = useAuthStore();
const toast = useToast();
const { t, te } = useI18n();

const loadingBilling = ref(false);
const billingError = ref('');
const billingAccount = ref(null);
const packages = ref([]);
const invoices = ref([]);
const ledger = ref([]);
const checkoutPackageId = ref('');
const billingConfiguration = ref({ mode: 'prepaidTokens', currentTariff: null, currentTariffLabelKey: null });

const organizationId = computed(() => props.screen.scope?.organizationId || authStore.organizationData?._id || authStore.userData?.organizationId || authStore.user?.organizationId);
const regions = computed(() => props.screen.regions || []);
const mainRegions = computed(() => regions.value.filter(region => (region.slot || 'main') === 'main'));
const supportingRegions = computed(() => regions.value.filter(region => region.slot === 'supporting'));
const screenActions = computed(() => props.screen.systemActions || []);
const canCheckout = computed(() => screenActions.value.some(action => action.id === 'organization.billing.checkout'));
const currentTariffLabel = computed(() => resolveCurrentTariffLabel(billingConfiguration.value, {
  translate: t,
  hasTranslation: te
}));

onMounted(async () => {
  await Promise.all([loadBilling(), loadPackages()]);
  if (route.query.checkoutInternalId) await syncCheckout(route.query.checkoutInternalId);
});

function hasRegion(id) {
  return regions.value.some(region => region.id === id || region.kind === id);
}

function packageLabel(pack = {}) {
  if (pack.labelKey && te(pack.labelKey)) return t(pack.labelKey);
  return pack.label || `${pack.tokenAmount} ${t('billing.tokens')}`;
}

async function loadBilling() {
  if (!organizationId.value || !hasRegion('billingAccount')) return;
  loadingBilling.value = true;
  billingError.value = '';
  try {
    const data = await $fetch(`/api/organizations/${organizationId.value}/billing/account`);
    billingAccount.value = data.account;
    billingConfiguration.value = data.billing || billingConfiguration.value;
    invoices.value = data.invoices || [];
    ledger.value = data.ledger || [];
  } catch (error) {
    billingError.value = error?.data?.message || error.message || '';
  } finally {
    loadingBilling.value = false;
  }
}

async function loadPackages() {
  if (!organizationId.value || !hasRegion('billingPackages')) return;
  try {
    const data = await $fetch(`/api/organizations/${organizationId.value}/billing/packages`);
    packages.value = data.packages || [];
    billingConfiguration.value = data.billing || billingConfiguration.value;
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

function ledgerTypeLabel(type = '') {
  const key = `billing.ledgerTypes.${type}`;
  return te(key) ? t(key) : type;
}

function billingStatusLabel(status = '') {
  const key = `billing.statuses.${status}`;
  return status && te(key) ? t(key) : status;
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
