// The app's chip surface recipes (SPEC §22.8): every PrimeVue Chip the
// app renders — file chips, instance chips, card identity chips — rides
// the same truncating label passthrough and the bordered chip classes.
export const CHIP_LABEL_PT = Object.freeze({
  label: { class: 'truncate leading-none' },
  icon: { class: '!text-[1rem] !leading-none' }
});
const INLINE_CHIP_LAYOUT = 'inline-flex items-center gap-1.5 h-6 !px-2 !py-0 rounded-full align-middle leading-none';
export const FILE_CHIP_CLASS = `min-w-0 max-w-full border border-content-border bg-subtle text-supporting ${INLINE_CHIP_LAYOUT}`;
export const INSTANCE_CHIP_CLASS = `min-w-0 max-w-full border border-content-border bg-transparent text-supporting ${INLINE_CHIP_LAYOUT}`;
