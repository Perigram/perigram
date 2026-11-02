import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getBillingCatalog, findBillingPackage, getBillingConfiguration } from './pricing.js';

const { mockedConnectDB, mockedGetCheckoutPaymentStatus } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn(),
  mockedGetCheckoutPaymentStatus: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));
vi.mock('./sync.js', () => ({ getCheckoutPaymentStatus: mockedGetCheckoutPaymentStatus }));
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as billingService from './service.js';

describe('organization billing', () => {
  it('reads token packages from runtime configuration', () => {
    const runtimeConfig = {
      billing: {
        priceCatalog: JSON.stringify([
          { id: 'starter', label: 'Starter', tokenAmount: 25, stripePriceId: 'price_123', currency: 'EUR', amount: 1000 }
        ])
      }
    };

    expect(getBillingCatalog(runtimeConfig)).toEqual([{
      id: 'starter',
      labelKey: null,
      label: 'Starter',
      tokenAmount: 25,
      stripePriceId: 'price_123',
      currency: 'EUR',
      amount: 1000
    }]);
    expect(findBillingPackage('starter', runtimeConfig)?.stripePriceId).toBe('price_123');
  });

  it('ignores invalid externally configured packages', () => {
    expect(getBillingCatalog({
      billing: {
        priceCatalog: [
          { id: 'missing-price', tokenAmount: 10 },
          { id: 'missing-tokens', stripePriceId: 'price_123' }
        ]
      }
    })).toEqual([]);
  });

  it('derives service token cost only from prepaid service contracts', () => {
    expect(billingService.getServiceTokenCost({ billing: { mode: 'prepaidTokens', tokenCost: 2 } })).toBe(2);
    expect(billingService.getServiceTokenCost({ billing: { mode: 'none', tokenCost: 2 } })).toBe(0);
  });

  it('exposes a current tariff only when tariff deployment mode is configured', () => {
    expect(getBillingConfiguration({ billing: { mode: 'prepaidTokens', currentTariff: 'pro' } })).toEqual({
      mode: 'prepaidTokens',
      currentTariff: null,
      currentTariffLabelKey: null
    });
    expect(getBillingConfiguration({ billing: { mode: 'tariff', currentTariff: 'pro', currentTariffLabelKey: 'billing.tariffs.pro' } })).toEqual({
      mode: 'tariff',
      currentTariff: 'pro',
      currentTariffLabelKey: 'billing.tariffs.pro'
    });
  });
});

describe('billing payment machine', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockedConnectDB.mockReturnValue(db);
    await db.collection('organization_billing_accounts').deleteMany({});
    await db.collection('organization_billing_ledger').deleteMany({});
    await db.collection('organization_billing_invoices').deleteMany({});
    await db.collection('organization_billing_payments').deleteMany({});
  });

  async function seedPayment({ status = 'created', attempt = 1, createdAt = new Date() } = {}) {
    const organizationId = new ObjectId();
    const accountId = new ObjectId();
    const invoiceId = new ObjectId();
    const paymentId = new ObjectId();
    await db.collection('organization_billing_accounts').insertOne({
      _id: accountId,
      organizationId,
      balance: 0,
      currency: 'tokens',
      status: 'active',
      createdAt,
      updatedAt: createdAt
    });
    await db.collection('organization_billing_invoices').insertOne({
      _id: invoiceId,
      organizationId,
      accountId,
      packageId: 'starter',
      tokenAmount: 25,
      status: 'open',
      createdAt,
      updatedAt: createdAt
    });
    await db.collection('organization_billing_payments').insertOne({
      _id: paymentId,
      organizationId,
      accountId,
      invoiceId,
      provider: 'stripe',
      checkoutId: `cs_${paymentId}`,
      checkoutInternalId: `internal_${paymentId}`,
      tokenAmount: 25,
      status,
      attempt,
      createdAt,
      updatedAt: createdAt
    });
    return { organizationId, accountId, invoiceId, paymentId };
  }

  async function loadPayment(paymentId) {
    return db.collection('organization_billing_payments').findOne({ _id: paymentId });
  }

  async function loadInvoice(invoiceId) {
    return db.collection('organization_billing_invoices').findOne({ _id: invoiceId });
  }

  it('credits once and marks the payment completed and the invoice paid', async () => {
    mockedGetCheckoutPaymentStatus.mockResolvedValue('paid');
    const { paymentId, invoiceId, organizationId } = await seedPayment();

    const payment = await loadPayment(paymentId);
    const result = await billingService.syncPayment(payment);

    expect(result.status).toBe('completed');
    expect((await loadPayment(paymentId)).status).toBe('completed');
    expect((await loadInvoice(invoiceId)).status).toBe('paid');
    expect((await db.collection('organization_billing_accounts').findOne({ organizationId })).balance).toBe(25);
    expect(await db.collection('organization_billing_ledger').countDocuments()).toBe(1);
  });

  it('returns an unpaid payment to created for another attempt', async () => {
    mockedGetCheckoutPaymentStatus.mockResolvedValue('unpaid');
    const { paymentId, invoiceId } = await seedPayment({ attempt: 1 });

    const payment = await loadPayment(paymentId);
    const result = await billingService.syncPayment(payment);

    expect(result).toMatchObject({ status: 'created', lastProviderStatus: 'unpaid' });
    expect((await loadInvoice(invoiceId)).status).toBe('open');
  });

  it('settles a failed attempt at the cap as failed with its last provider error', async () => {
    mockedGetCheckoutPaymentStatus.mockRejectedValue(new Error('stripe unavailable'));
    const { paymentId, invoiceId } = await seedPayment({ attempt: 2 });

    await expect(billingService.syncNextPendingPayment()).rejects.toThrow('stripe unavailable');

    const payment = await loadPayment(paymentId);
    expect(payment.status).toBe('failed');
    expect(payment.attempt).toBe(3);
    expect(payment.lastError).toBe('stripe unavailable');
    expect((await loadInvoice(invoiceId)).status).toBe('failed');
    expect(await billingService.syncNextPendingPayment()).toBeNull();
  });

  it('settles an unpaid payment at the cap as failed', async () => {
    mockedGetCheckoutPaymentStatus.mockResolvedValue('unpaid');
    const { paymentId, invoiceId } = await seedPayment({ status: 'processing', attempt: 3 });

    const payment = await loadPayment(paymentId);
    const result = await billingService.syncPayment(payment);

    expect(result).toMatchObject({ status: 'failed', lastProviderStatus: 'unpaid' });
    expect((await loadInvoice(invoiceId)).status).toBe('failed');
  });

  it('resets interrupted processing payments at startup and fails the capped ones', async () => {
    const retry = await seedPayment({ status: 'processing', attempt: 1 });
    const capped = await seedPayment({ status: 'processing', attempt: 3 });
    const completed = await seedPayment({ status: 'completed', attempt: 1 });

    await expect(billingService.resetInterruptedPayments()).resolves.toEqual({ failed: 1 });

    expect((await loadPayment(retry.paymentId)).status).toBe('created');
    expect((await loadPayment(capped.paymentId)).status).toBe('failed');
    expect((await loadInvoice(capped.invoiceId)).status).toBe('failed');
    expect((await loadPayment(completed.paymentId)).status).toBe('completed');
  });

  it('applies a duplicate completion as a no-op', async () => {
    mockedGetCheckoutPaymentStatus.mockResolvedValue('paid');
    const { paymentId, organizationId } = await seedPayment();

    await billingService.syncPayment(await loadPayment(paymentId));
    await billingService.syncPayment(await loadPayment(paymentId));

    expect((await db.collection('organization_billing_accounts').findOne({ organizationId })).balance).toBe(25);
    expect(await db.collection('organization_billing_ledger').countDocuments()).toBe(1);
  });

  it('keeps a failed payment terminal when the provider later reports paid', async () => {
    mockedGetCheckoutPaymentStatus.mockResolvedValue('paid');
    const { paymentId, invoiceId, organizationId } = await seedPayment({ status: 'failed', attempt: 3 });

    const result = await billingService.syncPayment(await loadPayment(paymentId));

    expect(result.status).toBe('failed');
    expect((await loadInvoice(invoiceId)).status).toBe('open');
    expect((await db.collection('organization_billing_accounts').findOne({ organizationId })).balance).toBe(0);
    expect(await db.collection('organization_billing_ledger').countDocuments()).toBe(0);
  });
});
