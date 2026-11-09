// The app's chip surface recipes (SPEC §22.8): every PrimeVue Chip the
// app renders — file chips, instance chips, card identity chips — rides
// the same truncating label passthrough and the bordered chip classes.
// Padding, gap, radius, and the icon box live in the chip component
// tokens; these classes carry only the inline typography, the clamps,
// and the surface role.
export const CHIP_LABEL_PT = Object.freeze({
  label: { class: 'truncate' },
  icon: { class: 'self-center !transform-none' }
});
const INLINE_CHIP_LAYOUT = 'ck-chip min-w-0 max-w-full items-baseline font-sans font-normal text-[0.875em] leading-none';
export const FILE_CHIP_CLASS = `border border-content-border bg-subtle ${INLINE_CHIP_LAYOUT}`;
export const INSTANCE_CHIP_CLASS = `border border-content-border bg-transparent ${INLINE_CHIP_LAYOUT}`;
