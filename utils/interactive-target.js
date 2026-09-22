const INTERACTIVE_TARGET_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[data-instance-card-interactive="true"]'
].join(',');

export function isInteractiveEventTarget(event) {
  const target = event?.target;
  const currentTarget = event?.currentTarget;
  if (!target?.closest || !currentTarget) return false;

  const interactiveTarget = target.closest(INTERACTIVE_TARGET_SELECTOR);
  return Boolean(interactiveTarget && interactiveTarget !== currentTarget);
}
