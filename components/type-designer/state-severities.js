// The state-severity vocabulary both declaration surfaces offer as
// select options (PrimeVue Tag severities): the canvas inspector and the
// in-place declaration editor.
export const STATE_SEVERITY_OPTIONS = ['info', 'success', 'warn', 'danger', 'secondary']
  .map(value => ({ label: value, value }));
