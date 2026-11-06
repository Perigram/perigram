// The severity vocabulary both declaration surfaces offer as select
// options (PrimeVue Tag severities); labels localize through
// `processDesigner.stateSeverities.*`.
export const STATE_SEVERITY_VALUES = ['info', 'success', 'warn', 'danger', 'secondary'];

export function stateSeverityOptions(t) {
  return STATE_SEVERITY_VALUES.map(value => ({ label: t(`processDesigner.stateSeverities.${value}`), value }));
}
