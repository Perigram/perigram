// The app's chip surface recipes (SPEC §22.8): every PrimeVue Chip the
// app renders — file chips, instance chips, card identity chips — rides
// the same truncating label passthrough and the bordered chip classes.
export const CHIP_LABEL_PT = Object.freeze({ label: { class: 'truncate' } });
export const FILE_CHIP_CLASS = 'min-w-0 max-w-full border border-content-border bg-subtle text-supporting';
export const INSTANCE_CHIP_CLASS = 'min-w-0 max-w-full border border-content-border bg-transparent text-supporting';
