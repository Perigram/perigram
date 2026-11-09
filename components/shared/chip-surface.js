// The app's chip surface recipes (SPEC §22.8): every PrimeVue Chip the
// app renders — file chips, instance chips, card identity chips — rides
// the same truncating label passthrough and the bordered chip classes.
export const CHIP_LABEL_PT = Object.freeze({
  label: { class: 'truncate leading-none' },
  icon: { class: '!text-[1em] !leading-none !transform-none' }
});
const INLINE_CHIP_LAYOUT = '!inline-flex items-center gap-[0.375em] !px-[0.5em] !py-0 rounded-[var(--p-border-radius-sm)] align-baseline font-sans font-normal text-[0.875em] leading-none';
export const FILE_CHIP_CLASS = `min-w-0 max-w-full border border-content-border bg-subtle ${INLINE_CHIP_LAYOUT}`;
export const INSTANCE_CHIP_CLASS = `min-w-0 max-w-full border border-content-border bg-transparent ${INLINE_CHIP_LAYOUT}`;
