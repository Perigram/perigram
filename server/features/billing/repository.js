import { ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const ACCOUNTS = 'organization_billing_accounts';
const LEDGER = 'organization_billing_ledger';
const INVOICES = 'organization_billing_invoices';
const PAYMENTS = 'organization_billing_payments';

export async function findAccountByOrganizationId(organizationId) {
  const db = await connectDB();
  return db.collection(ACCOUNTS).findOne({ organizationId: toFlexibleId(organizationId) });
}

export async function createAccount({ organizationId, createdAt = new Date() }) {
  const db = await connectDB();
  const doc = {
    _id: new ObjectId(),
    organizationId: toFlexibleId(organizationId),
    balance: 0,
    currency: 'tokens',
    status: 'active',
    createdAt,
    updatedAt: createdAt
  };
  await db.collection(ACCOUNTS).insertOne(doc);
  return doc;
}

export async function incrementAccountBalance({ organizationId, amount }) {
  const db = await connectDB();
  await db.collection(ACCOUNTS).updateOne(
    { organizationId: toFlexibleId(organizationId) },
    { $inc: { balance: Number(amount) || 0 }, $set: { updatedAt: new Date() } }
  );
  return findAccountByOrganizationId(organizationId);
}

export async function insertLedgerEntry(entry) {
  const db = await connectDB();
  const doc = {
    ...entry,
    _id: entry._id || new ObjectId(),
    organizationId: toFlexibleId(entry.organizationId),
    amount: Number(entry.amount) || 0,
    createdAt: entry.createdAt || new Date()
  };
  await db.collection(LEDGER).insertOne(doc);
  return doc;
}

export async function findLedgerEntries({ organizationId, limit = 50 } = {}) {
  const db = await connectDB();
  return db.collection(LEDGER)
    .find({ organizationId: toFlexibleId(organizationId) })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .toArray();
}

export async function createInvoice(invoice) {
  const db = await connectDB();
  const now = new Date();
  const doc = {
    ...invoice,
    _id: invoice._id || new ObjectId(),
    organizationId: toFlexibleId(invoice.organizationId),
    status: invoice.status || 'open',
    createdAt: invoice.createdAt || now,
    updatedAt: invoice.updatedAt || now
  };
  await db.collection(INVOICES).insertOne(doc);
  return doc;
}

export async function updateInvoiceById(id, updates) {
  const db = await connectDB();
  await db.collection(INVOICES).updateOne(
    { _id: toFlexibleId(id) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return findInvoiceById(id);
}

export async function findInvoiceById(id) {
  const db = await connectDB();
  return db.collection(INVOICES).findOne({ _id: toFlexibleId(id) });
}

export async function findInvoices({ organizationId, limit = 50 } = {}) {
  const db = await connectDB();
  return db.collection(INVOICES)
    .find({ organizationId: toFlexibleId(organizationId) })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .toArray();
}

export async function createPayment(payment) {
  const db = await connectDB();
  const now = new Date();
  const doc = {
    ...payment,
    _id: payment._id || new ObjectId(),
    organizationId: toFlexibleId(payment.organizationId),
    invoiceId: toFlexibleId(payment.invoiceId),
    status: payment.status || 'created',
    attempt: Number(payment.attempt) || 0,
    createdAt: payment.createdAt || now,
    updatedAt: payment.updatedAt || now
  };
  await db.collection(PAYMENTS).insertOne(doc);
  return doc;
}

export async function findPaymentById(id) {
  const db = await connectDB();
  return db.collection(PAYMENTS).findOne({ _id: toFlexibleId(id) });
}

export async function findPaymentByCheckoutInternalId(checkoutInternalId) {
  const db = await connectDB();
  return db.collection(PAYMENTS).findOne({ checkoutInternalId });
}

export async function updatePaymentById(id, updates) {
  const db = await connectDB();
  await db.collection(PAYMENTS).updateOne(
    { _id: toFlexibleId(id) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return findPaymentById(id);
}

export async function completePaymentOnce(id, updates) {
  const db = await connectDB();
  return db.collection(PAYMENTS).findOneAndUpdate(
    { _id: toFlexibleId(id), status: { $ne: 'completed' } },
    { $set: { ...updates, status: 'completed', updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
}

export async function claimPendingPayment() {
  const db = await connectDB();
  const result = await db.collection(PAYMENTS).findOneAndUpdate(
    {
      status: 'created',
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
      attempt: { $lt: 3 }
    },
    { $set: { status: 'processing', updatedAt: new Date() }, $inc: { attempt: 1 } },
    { returnDocument: 'after' }
  );
  return result;
}
