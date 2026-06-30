# COMPONENT: Billing

Organization-owned prepaid token accounting.

Billing is a capability module, not a v24 persisted entity module. It owns
organization billing accounts, invoices, payments, and token ledger entries
behind service/repository boundaries. User records do not own spendable credit
balances.

## Runtime Pricing

Purchasable token packages come from runtime configuration:

```env
NUXT_BILLING_PRICE_CATALOG='[{"id":"starter","label":"Starter","tokenAmount":25,"stripePriceId":"price_...","currency":"USD","amount":1000}]'
```

The catalog is parsed by `pricing.js`. Invalid entries are ignored. API routes
must not hardcode package prices or read package definitions from app database
collections.

## Collections

- `organization_billing_accounts`: one prepaid token balance per organization.
- `organization_billing_ledger`: immutable credit/debit entries.
- `organization_billing_invoices`: package purchase records.
- `organization_billing_payments`: Stripe checkout state and visible provider
  errors.

Payment completion is idempotent: a payment is first claimed as `completed`,
then the account is credited and a ledger row is written. Browser return sync
and background Stripe polling both use the same service path.

## Service Token Consumption

Compiled process services may carry:

```js
billing: { mode: 'prepaidTokens', tokenCost: 1, meterKey: 'nesting.solve' }
```

`server/core/commands` checks the active process service contract before
executing a command. If the service requires prepaid tokens, the runtime checks
the active organization's account before the handler and debits tokens only
after the command succeeds.

## API

Organization billing routes live under:

- `GET /api/organizations/:id/billing/account`
- `GET /api/organizations/:id/billing/packages`
- `POST /api/organizations/:id/billing/checkout`
- `POST /api/organizations/:id/billing/check`

All routes require the requested organization to be the active organization.
Account/package/check reads require `organizations:read`; checkout creation
requires `organizations:admin`.
