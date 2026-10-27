// The app's chip surface recipes (SPEC §22.8): every PrimeVue Chip the
// app renders — file chips, instance chips, card identity chips — rides
// the same truncating label passthrough and the clamping classes. Chip
// surface, radius, and typography are the preset's own.
export const CHIP_LABEL_PT = Object.freeze({ label: { class: 'truncate' } });
export const FILE_CHIP_CLASS = 'min-w-0 max-w-full';
export const INSTANCE_CHIP_CLASS = 'min-w-0 max-w-full';
