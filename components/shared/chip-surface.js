// The app's chip surface recipes (SPEC §22.8): every PrimeVue Chip the
// app renders — file chips, instance chips, card identity chips — rides
// the same truncating label passthrough and the bordered chip classes.
// The default face keeps Aura's chip geometry; the prose face carries
// the inline-code layout for page text blocks and their read composition.
export const CHIP_LABEL_PT = Object.freeze({
  label: { class: 'truncate' }
});
export const PROSE_CHIP_LABEL_PT = Object.freeze({
  label: { class: 'truncate leading-none' },
  icon: { class: '!text-[1em] !leading-none !transform-none' }
});
const CHIP_CLASS = 'min-w-0 max-w-full border border-content-border text-supporting';
export const FILE_CHIP_CLASS = `bg-subtle ${CHIP_CLASS}`;
export const INSTANCE_CHIP_CLASS = `bg-transparent ${CHIP_CLASS}`;
const PROSE_CHIP_CLASS = 'ck-chip inline-flex min-w-0 max-w-full items-center align-baseline font-sans font-normal text-[0.875em] leading-none';
export const FILE_PROSE_CHIP_CLASS = `border border-content-border bg-subtle ${PROSE_CHIP_CLASS}`;
export const INSTANCE_PROSE_CHIP_CLASS = `border border-content-border bg-transparent ${PROSE_CHIP_CLASS}`;
