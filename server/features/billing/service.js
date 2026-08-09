import { createError } from 'h3';
import { generateRandomString } from '../../utils/strings.js';
import { hasPermission } from '../../utils/auth-helpers.js';
import * as repository from './repository.js';
import { findBillingPackage, getBillingCatalog, getBillingConfiguration } from './pricing.js';
import { getCheckoutPaymentStatus } from './sync.js';

export async function getAccountSummary({ organizationId, auth, limit = 50, runtimeConfig = useRuntimeConfig() }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'read');
  const account = await getOrCreateAccount(organizationId);
  const [ledger, invoices] = await Promise.all([
    repository.findLedgerEntries({ organizationId, limit }),
    repository.findInvoices({ organizationId, limit })
  ]);
  return {
    billing: getBillingConfiguration(runtimeConfig),
    account: serializeAccount(account),
    ledger: ledger.map(serializeLedgerEntry),
    invoices: invoices.map(serializeInvoice)
  };
}

export function listPackages(runtimeConfig = useRuntimeConfig()) {
  return getBillingCatalog(runtimeConfig);
}

export function listPackagesForOrganization({ organizationId, auth, runtimeConfig = useRuntimeConfig() }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'read');
  return listPackages(runtimeConfig);
}

export function getConfiguration(runtimeConfig = useRuntimeConfig()) {
  return getBillingConfiguration(runtimeConfig);
}

export async function createCheckout({ organizationId, packageId, auth, runtimeConfig = useRuntimeConfig() }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');

  const pack = findBillingPackage(packageId, runtimeConfig);
  if (!pack) throw createError({ statusCode: 400, message: 'Unknown billing package' });
  const account = await getOrCreateAccount(organizationId);
  const checkoutInternalId = generateRandomString(24);
  const invoice = await repository.createInvoice({
    organizationId,
    accountId: account._id,
    packageId: pack.id,
    tokenAmount: pack.tokenAmount,
    stripePriceId: pack.stripePriceId,
    currency: pack.currency,
    amount: pack.amount,
    status: 'open',
    createdBy: auth.userId
  });

  const checkout = await createStripeCheckoutSession({
    organizationId,
    auth,
    pack,
    invoiceId: invoice._id,
    checkoutInternalId,
    runtimeConfig
  });

  const payment = await repository.createPayment({
    organizationId,
    accountId: account._id,
    invoiceId: invoice._id,
    provider: 'stripe',
    checkoutInternalId,
    checkoutId: checkout.id,
    checkoutUrl: checkout.url,
    tokenAmount: pack.tokenAmount,
    stripePriceId: pack.stripePriceId,
    status: 'created',
    createdBy: auth.userId
  });

  await repository.updateInvoiceById(invoice._id, { paymentId: payment._id });

  return {
    checkoutUrl: checkout.url,
    checkoutInternalId,
    invoice: serializeInvoice({ ...invoice, paymentId: payment._id }),
    payment: serializePayment(payment)
  };
}

export async function syncPaymentByCheckoutInternalId({ organizationId, checkoutInternalId, auth }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'read');
  if (!checkoutInternalId) throw createError({ statusCode: 400, message: 'Missing checkout id' });
  const payment = await repository.findPaymentByCheckoutInternalId(checkoutInternalId);
  if (!payment || String(payment.organizationId) !== String(organizationId)) {
    throw createError({ statusCode: 404, message: 'Payment not found' });
  }
  return syncPayment(payment);
}

export async function syncPayment(payment) {
  if (!payment) return null;
  if (payment.status === 'completed') return serializePayment(payment);

  const status = await getCheckoutPaymentStatus(payment.checkoutId);
  if (status !== 'paid') {
    const updated = await repository.updatePaymentById(payment._id, {
      status: 'created',
      lastProviderStatus: status,
      lastError: null
    });
    return serializePayment(updated);
  }

  const completed = await repository.completePaymentOnce(payment._id, {
    lastProviderStatus: status,
    completedAt: new Date(),
    lastError: null
  });
  if (!completed) {
    const current = await repository.findPaymentById(payment._id);
    return serializePayment(current);
  }

  await getOrCreateAccount(payment.organizationId);
  await repository.incrementAccountBalance({
    organizationId: payment.organizationId,
    amount: payment.tokenAmount
  });
  await repository.insertLedgerEntry({
    organizationId: payment.organizationId,
    accountId: payment.accountId,
    amount: payment.tokenAmount,
    type: 'payment_credit',
    source: {
      paymentId: payment._id,
      invoiceId: payment.invoiceId,
      provider: 'stripe',
      checkoutId: payment.checkoutId
    }
  });
  await repository.updateInvoiceById(payment.invoiceId, {
    status: 'paid',
    paidAt: new Date()
  });
  return serializePayment(completed);
}

export async function syncNextPendingPayment() {
  const payment = await repository.claimPendingPayment();
  if (!payment) return null;
  try {
    return await syncPayment(payment);
  } catch (error) {
    await repository.updatePaymentById(payment._id, {
      status: 'created',
      lastError: error.message
    });
    throw error;
  }
}

export async function assertSufficientServiceTokens({ organizationId, service, commandId }) {
  const cost = getServiceTokenCost(service);
  if (cost <= 0) return { required: false, cost: 0 };
  const account = await getOrCreateAccount(organizationId);
  if ((Number(account.balance) || 0) < cost) {
    throw createError({ statusCode: 402, message: `Organization account has fewer than ${cost} tokens for ${commandId}` });
  }
  return { required: true, cost, balance: Number(account.balance) || 0 };
}

export async function debitServiceTokens({ organizationId, service, commandId, commandRunId }) {
  const cost = getServiceTokenCost(service);
  if (cost <= 0) return null;
  const account = await getOrCreateAccount(organizationId);
  if ((Number(account.balance) || 0) < cost) {
    throw createError({ statusCode: 402, message: `Organization account has fewer than ${cost} tokens for ${commandId}` });
  }
  const updated = await repository.incrementAccountBalance({ organizationId, amount: -cost });
  const entry = await repository.insertLedgerEntry({
    organizationId,
    accountId: account._id,
    amount: -cost,
    type: 'service_debit',
    source: {
      commandId,
      commandRunId,
      serviceId: service?.id || null,
      meterKey: service?.billing?.meterKey || null
    }
  });
  return {
    account: serializeAccount(updated),
    ledgerEntry: serializeLedgerEntry(entry)
  };
}

export function getServiceTokenCost(service = {}) {
  if (service?.billing?.mode !== 'prepaidTokens') return 0;
  const cost = Number(service.billing.tokenCost);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

async function getOrCreateAccount(organizationId) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Missing organization id' });
  const existing = await repository.findAccountByOrganizationId(organizationId);
  if (existing) return existing;
  return repository.createAccount({ organizationId });
}

async function createStripeCheckoutSession({ organizationId, auth, pack, invoiceId, checkoutInternalId, runtimeConfig }) {
  const stripeSecretKey = runtimeConfig.stripeSecretKey;
  if (!stripeSecretKey) throw createError({ statusCode: 503, message: 'Stripe secret key is not configured' });
  const baseUrl = runtimeConfig.public?.baseUrl || 'http://localhost:3000';
  const redirectUrl = `${baseUrl}/organization?checkoutInternalId=${checkoutInternalId}`;

  const params = new URLSearchParams();
  params.append('success_url', redirectUrl);
  params.append('cancel_url', `${baseUrl}/organization`);
  params.append('mode', 'payment');
  if (auth.email) params.append('customer_email', auth.email);
  params.append('client_reference_id', String(organizationId));
  params.append('line_items[0][price]', pack.stripePriceId);
  params.append('line_items[0][quantity]', '1');
  params.append('metadata[organizationId]', String(organizationId));
  params.append('metadata[invoiceId]', String(invoiceId));
  params.append('metadata[checkoutInternalId]', checkoutInternalId);
  params.append('metadata[tokenAmount]', String(pack.tokenAmount));
  params.append('allow_promotion_codes', 'true');

  return $fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
}

function assertSameOrganization(organizationId, auth = {}) {
  const activeOrgId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  if (!activeOrgId || String(activeOrgId) !== String(organizationId)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
}

function assertOrganizationPermission(auth = {}, level) {
  if (!hasPermission(auth, 'organizations', level)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
}

function serializeAccount(account = {}) {
  return {
    _id: String(account._id),
    organizationId: String(account.organizationId),
    balance: Number(account.balance) || 0,
    currency: account.currency || 'tokens',
    status: account.status || 'active',
    updatedAt: account.updatedAt
  };
}

function serializeLedgerEntry(entry = {}) {
  return {
    _id: String(entry._id),
    organizationId: String(entry.organizationId),
    amount: Number(entry.amount) || 0,
    type: entry.type,
    source: entry.source || {},
    createdAt: entry.createdAt
  };
}

function serializeInvoice(invoice = {}) {
  return {
    _id: String(invoice._id),
    organizationId: String(invoice.organizationId),
    packageId: invoice.packageId,
    tokenAmount: Number(invoice.tokenAmount) || 0,
    stripePriceId: invoice.stripePriceId,
    currency: invoice.currency,
    amount: invoice.amount,
    status: invoice.status,
    paymentId: invoice.paymentId ? String(invoice.paymentId) : null,
    createdAt: invoice.createdAt,
    paidAt: invoice.paidAt || null
  };
}

function serializePayment(payment = {}) {
  return {
    _id: String(payment._id),
    organizationId: String(payment.organizationId),
    invoiceId: String(payment.invoiceId),
    checkoutInternalId: payment.checkoutInternalId,
    checkoutUrl: payment.checkoutUrl,
    tokenAmount: Number(payment.tokenAmount) || 0,
    status: payment.status,
    lastProviderStatus: payment.lastProviderStatus || null,
    lastError: payment.lastError || null,
    createdAt: payment.createdAt,
    completedAt: payment.completedAt || null
  };
}
