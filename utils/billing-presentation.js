export function currentTariffLabel(configuration = {}, { translate, hasTranslation } = {}) {
  if (configuration.mode !== 'tariff') return '';
  const key = configuration.currentTariffLabelKey;
  if (key && hasTranslation(key)) return translate(key);
  return configuration.currentTariff || '';
}
