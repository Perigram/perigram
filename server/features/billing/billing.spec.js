import { describe, expect, it } from 'vitest';
import { getBillingCatalog, findBillingPackage } from './pricing.js';
import { getServiceTokenCost } from './service.js';

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
    expect(getServiceTokenCost({ billing: { mode: 'prepaidTokens', tokenCost: 2 } })).toBe(2);
    expect(getServiceTokenCost({ billing: { mode: 'none', tokenCost: 2 } })).toBe(0);
  });
});
