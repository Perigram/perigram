import { describe, expect, it } from 'vitest';
import { currentTariffLabel } from './billing-presentation.js';

describe('current tariff label', () => {
  it('shows a deployment tariff only in tariff mode', () => {
    const translations = { 'billing.tariffs.pro': 'Professional' };
    const i18n = { translate: key => translations[key], hasTranslation: key => Boolean(translations[key]) };
    expect(currentTariffLabel({ mode: 'prepaidTokens', currentTariff: 'pro' }, i18n)).toBe('');
    expect(currentTariffLabel({ mode: 'tariff', currentTariff: 'pro', currentTariffLabelKey: 'billing.tariffs.pro' }, i18n)).toBe('Professional');
    expect(currentTariffLabel({ mode: 'tariff', currentTariff: 'custom' }, i18n)).toBe('custom');
  });
});
