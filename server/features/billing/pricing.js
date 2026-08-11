const DEFAULT_CURRENCY = 'USD';

export function getBillingCatalog(runtimeConfig = {}) {
  const rawCatalog = runtimeConfig.billing?.priceCatalog || runtimeConfig.billingPriceCatalog || [];
  const parsed = parseCatalog(rawCatalog);
  return parsed.map(normalizePackage).filter(Boolean);
}

export function findBillingPackage(packageId, runtimeConfig = {}) {
  return getBillingCatalog(runtimeConfig).find(item => item.id === packageId) || null;
}

export function getBillingConfiguration(runtimeConfig = {}) {
  const configuredMode = String(runtimeConfig.billing?.mode || 'prepaidTokens');
  const mode = ['none', 'prepaidTokens', 'tariff'].includes(configuredMode)
    ? configuredMode
    : 'prepaidTokens';
  const currentTariff = String(runtimeConfig.billing?.currentTariff || '').trim();
  const currentTariffLabelKey = String(runtimeConfig.billing?.currentTariffLabelKey || '').trim();
  return {
    mode,
    currentTariff: mode === 'tariff' && currentTariff ? currentTariff : null,
    currentTariffLabelKey: mode === 'tariff' && currentTariffLabelKey ? currentTariffLabelKey : null
  };
}

function parseCatalog(rawCatalog) {
  if (Array.isArray(rawCatalog)) return rawCatalog;
  if (!rawCatalog || typeof rawCatalog !== 'string') return [];
  try {
    const parsed = JSON.parse(rawCatalog);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizePackage(item = {}) {
  const tokenAmount = Number(item.tokenAmount ?? item.tokens ?? item.credit);
  const stripePriceId = String(item.stripePriceId || '').trim();
  const id = String(item.id || stripePriceId || '').trim();
  if (!id || !stripePriceId || !Number.isFinite(tokenAmount) || tokenAmount <= 0) return null;
  return {
    id,
    labelKey: item.labelKey || null,
    label: item.label || `${tokenAmount} tokens`,
    tokenAmount,
    stripePriceId,
    currency: item.currency || DEFAULT_CURRENCY,
    amount: item.amount ?? null
  };
}
